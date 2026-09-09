import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { choices } from './throw'
import { createWorld, npc, type Content } from './world'

const dialogue: Content['dialogues'][string] = {
  name: '[PLACEHOLDER NPC NAME]',
  start: [{ node: 'pick' }],
  nodes: {
    pick: {
      text: '[PLACEHOLDER pick]',
      choices: [
        { text: '[PLACEHOLDER chair]', next: 'chair' },
        { text: '[PLACEHOLDER chair]', next: 'chair' },
        { text: '[PLACEHOLDER egg]', next: 'egg' },
        { text: '[PLACEHOLDER certificate]', next: 'certificate' },
        { text: '[PLACEHOLDER carpet]', next: 'carpet' },
        { text: '[PLACEHOLDER seal]', next: 'seal' },
      ],
    },
    chair: { throw: { kind: 'chair', at: 'tarq' }, next: 'pick' },
    egg: { throw: { kind: 'egg', at: 'tarq' }, next: 'end' },
    certificate: { throw: { kind: 'certificate', at: 'tarq' }, next: 'pick' },
    carpet: { throw: { kind: 'floor', at: 'tarq' }, next: 'pick' },
    seal: { throw: { kind: 'seal', at: 'tarq' }, next: 'pick' },
    end: { text: '[PLACEHOLDER end]', next: null },
  },
}
const content: Content = { dialogues: { test: dialogue }, items: {} }

function scene() {
  const w = createWorld()
  w.objects = [
    { id: 'rug', kind: 'flyingcarpet', x: 20, y: 15 },
    Object.assign(npc('tarq', 'tarq', 20, 15, 'left', ''), { ride: 'rug' }),
  ]
  w.inventory = { chair: 2, egg: 1, certificate: 1, carpet: 1, seal: 1 }
  apply(w, { type: 'talk', key: 'test' }, content)
  return w
}

describe('the six throw choices', () => {
  it('removes each consumed copy from the menu, including the last inventory item', () => {
    const w = scene()
    expect(choices(w, dialogue.nodes.pick, dialogue)).toHaveLength(6)
    for (const remaining of [5, 4, 3, 2, 1]) {
      // The last entry is always a miss until only the egg remains.
      const list = choices(w, dialogue.nodes.pick, dialogue)
      const index = list.length - 1 - [...list].reverse().findIndex((c) => c.next !== 'egg')
      for (let i = 0; i < index; i++) apply(w, { type: 'move', dir: 'down' }, content)
      apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 16 }, content)
      apply(w, { type: 'tick', dt: 300 }, content)
      expect(w.throwing?.flight).toBeTruthy()
      expect(choices(w, dialogue.nodes.pick, dialogue)).toHaveLength(remaining)
      for (let i = 0; i < 50 && w.dialogue?.node !== 'pick'; i++)
        apply(w, { type: 'tick', dt: 100 }, content)
      expect(w.dialogue).toMatchObject({ node: 'pick', choice: 0 })
    }
    expect(choices(w, dialogue.nodes.pick, dialogue).map((c) => c.next)).toEqual(['egg'])
  })

  it('selects the second physical chair without consuming the first', () => {
    const w = scene()
    delete w.inventory.chair
    w.objects.push(
      { id: 'chair1', kind: 'chair', x: 15, y: 16 },
      { id: 'chair2', kind: 'chair', x: 14, y: 17 },
    )
    apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect(w.throwing?.object).toBe('chair2')
    expect(w.objects.some((o) => o.id === 'chair1')).toBe(true)
    expect(w.objects.some((o) => o.id === 'chair2')).toBe(false)
  })

  it('keeps a miss flying past Tarq and removes it only after it clears the screen', () => {
    const w = scene()
    for (let i = 0; i < 5; i++) apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    const flight = w.throwing!.flight!
    apply(w, { type: 'tick', dt: flight.hitAt - w.time + 100 }, content)
    expect(w.throwing?.flight).toEqual(flight)
    expect(w.throwing?.hit).toBe(true)
    expect(Math.hypot(flight.vx, flight.vy)).toBeCloseTo(20)
    expect(
      ((Math.hypot(flight.vx, flight.vy) * (flight.until - flight.at)) / 1000) * 16,
    ).toBeGreaterThan(640)
    apply(w, { type: 'tick', dt: flight.until - w.time }, content)
    expect(w.throwing).toBeNull()
    expect(choices(w, dialogue.nodes.pick, dialogue).some((c) => c.next === 'seal')).toBe(false)
  })
})
