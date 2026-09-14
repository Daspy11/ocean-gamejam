import { readFileSync } from 'node:fs'
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
      ],
    },
    chair: { throw: { kind: 'chair', at: 'tarq' }, next: 'pick' },
    egg: { throw: { kind: 'egg', at: 'tarq' }, next: 'end' },
    certificate: { throw: { kind: 'certificate', at: 'tarq' }, next: 'pick' },
    carpet: { throw: { kind: 'floor', at: 'tarq' }, next: 'pick' },
    end: { text: '[PLACEHOLDER end]', next: null },
  },
}
const content: Content = { dialogues: { test: dialogue }, items: {} }

function scene() {
  const w = createWorld()
  w.objects = [
    { id: 'rug', kind: 'flyingcarpet', x: 20, y: 15 },
    Object.assign(npc('tarq', 'tarq', 20, 15, 'left', ''), { ride: 'rug' }),
    { id: 'chair1', kind: 'chair', x: 15, y: 16 },
    { id: 'chair2', kind: 'chair', x: 14, y: 17 },
    { id: 'egg', kind: 'egg', x: 14, y: 15 },
    { id: 'certificate', kind: 'certificate', x: 13, y: 16 },
    { id: 'floor', kind: 'floor', x: 14, y: 16 },
  ]
  w.inventory = { chair: 2, egg: 1, certificate: 1, carpet: 1 }
  apply(w, { type: 'talk', key: 'test' }, content)
  return w
}

describe('the throw choices', () => {
  it('lists every available copy once, with no entries for absent items', () => {
    const w = scene()
    w.objects = w.objects.filter((o) => o.kind === 'npc' || o.kind === 'flyingcarpet')
    w.objects.push(
      { id: 'chair1', kind: 'chair', x: 15, y: 16 },
      { id: 'chair2', kind: 'chair', x: 14, y: 17 },
      { id: 'chair3', kind: 'chair', x: 16, y: 17 },
    )
    expect(choices(w, dialogue.nodes.pick, dialogue).map((c) => c.object)).toEqual([
      'chair1',
      'chair2',
      'chair3',
    ])
  })

  it('excludes bag items and items inside unopened chests', () => {
    const w = scene()
    w.objects = []
    expect(choices(w, dialogue.nodes.pick, dialogue)).toEqual([])
    w.objects.push({ id: 'egg-chest', kind: 'crate', x: 15, y: 16, item: 'egg', open: false })
    expect(choices(w, dialogue.nodes.pick, dialogue)).toEqual([])
  })

  it('dodges one tile right then left on his carpet, but never dodges the egg', () => {
    let w = scene()
    for (const x of [21, 20]) {
      apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 300 }, content)
      const tarq = w.objects.find((o) => o.id === 'tarq')!
      const rug = w.objects.find((o) => o.id === 'rug')!
      expect(rug.step).toMatchObject({ x, y: 15 })
      apply(w, { type: 'tick', dt: 125 }, content)
      expect(tarq).toMatchObject({ x, y: 15, ride: 'rug' })
      expect(rug).toMatchObject({ x, y: 15 })
      for (let i = 0; i < 50 && w.dialogue?.node !== 'pick'; i++)
        apply(w, { type: 'tick', dt: 100 }, content)
      w = JSON.parse(JSON.stringify(w))
    }
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect(w.throwing?.kind).toBe('egg')
    expect(w.objects.find((o) => o.id === 'rug')).toMatchObject({ x: 20, y: 15, step: null })
    expect(w.objects.find((o) => o.id === 'tarq')).toMatchObject({ x: 20, y: 15, ride: 'rug' })
  })

  it('removes each consumed copy from the menu', () => {
    const w = scene()
    expect(choices(w, dialogue.nodes.pick, dialogue)).toHaveLength(5)
    for (const remaining of [4, 3, 2, 1]) {
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
    for (let i = 0; i < 4; i++) apply(w, { type: 'move', dir: 'down' }, content)
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
    expect(choices(w, dialogue.nodes.pick, dialogue).some((c) => c.next === 'carpet')).toBe(false)
  })
})

it('plays the supplied Tarq replies after each miss, with both lines for the second chair', () => {
  const tarq: Content['dialogues'][string] = JSON.parse(
    readFileSync(new URL('../../assets/dialogue/tarq.json', import.meta.url), 'utf8'),
  )
  const c: Content = { dialogues: { tarq }, items: {} }
  const w = scene()
  w.dialogue = { key: 'tarq', node: 'pick', choice: 0 }
  for (const [kind, lines] of [
    ['certificate', ["your credentials don't scare me nerd"]],
    ['chair', ['i could sit and watch this for hours']],
    ['carpet', ["my carpet's magic. your carpet's picnic. loser."]],
    ['chair', ['did you seriously think that would work the second time?', 'no like seriously']],
  ] as const) {
    w.dialogue!.choice = choices(w, tarq.nodes.pick, tarq).findIndex((o) => o.next === kind)
    expect(w.dialogue!.choice).toBeGreaterThanOrEqual(0)
    apply(w, { type: 'interact' }, c)
    for (let i = 0; i < 100 && tarq.nodes[w.dialogue!.node].text === undefined; i++)
      apply(w, { type: 'tick', dt: 50 }, c)
    for (const text of lines) {
      expect(w.typing).toMatchObject({ who: 'Tarq', text })
      apply(w, { type: 'interact' }, c)
    }
    expect(w.dialogue).toMatchObject({ node: 'pick', choice: 0 })
  }
  expect(choices(w, tarq.nodes.pick, tarq).map((o) => o.next)).toEqual(['egg'])
})
