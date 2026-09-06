import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

// Etarp's bar on the north island as pirate.json leaves it: the L of counter at 23,2 23,3 22,3 21,3
// with him behind it at 22,2. The dialogue is the shape of etarp.json: rum in, a spin, a drink out.
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    etarp: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ has: { rum: 1 }, node: 'rum' }, { node: 'bar' }],
      nodes: {
        bar: { text: '[PLACEHOLDER he wants rum]', next: null },
        rum: { text: '[PLACEHOLDER fine]', take: 'rum', next: 'spin' },
        spin: { spin: 'etarp', next: 'here' },
        here: { text: '[PLACEHOLDER here]', drink: 'bar3', next: null },
      },
    },
  },
  items: {},
}

// across the counter from him: the player at 22,4 facing up at bar3, with Etarp behind it at 22,2
function atBar(): World {
  const w = createWorld()
  w.objects.push(
    { id: 'etarp', kind: 'npc', sprite: 'etarp', x: 22, y: 2, facing: 'left', dialogue: 'etarp' },
    { id: 'bar1', kind: 'bar', x: 23, y: 2 },
    { id: 'bar2', kind: 'bar', x: 23, y: 3 },
    { id: 'bar3', kind: 'bar', x: 22, y: 3 },
    { id: 'bar4', kind: 'bar', x: 21, y: 3 },
  )
  w.player = { ...w.player, x: 22, y: 4, facing: 'up' }
  return w
}
function etarp(w: World) {
  const o = w.objects.find((o) => o.id === 'etarp')
  if (o?.kind !== 'npc') throw new Error('etarp is not an npc')
  return o
}
function bar3(w: World) {
  const o = w.objects.find((o) => o.id === 'bar3')
  if (o?.kind !== 'bar') throw new Error('bar3 is not a bar')
  return o
}

describe('the bar', () => {
  it('is talked across: interact on a bare counter reaches whoever stands behind it', () => {
    const w = atBar()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toMatchObject({ key: 'etarp', node: 'bar' })
    expect(etarp(w).facing).toBe('down') // and he turns to the player like anyone talked to
  })

  it('is solid, and a counter with nobody behind it does nothing', () => {
    const w = atBar()
    w.player = { ...w.player, x: 21, y: 4, facing: 'up' } // bar4 at 21,3, the grass at 21,2 empty
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.y, w.player.step]).toEqual([4, null])
    apply(w, { type: 'move', dir: null }, content)
    const before = w.rev
    apply(w, { type: 'interact' }, content)
    expect([w.dialogue, w.rev]).toEqual([null, before])
  })
})

describe('the cocktail', () => {
  it('costs the rum, spins him for two seconds, and goes down on the counter', () => {
    const w = atBar()
    w.inventory.rum = 1
    w.flags['had:rum'] = true
    apply(w, { type: 'interact' }, content)
    expect([w.dialogue?.node, w.inventory.rum]).toEqual(['rum', undefined])

    apply(w, { type: 'interact' }, content) // onto the spin act
    expect(w.dialogue?.node).toBe('spin')
    expect(etarp(w).spin).toBe(w.time + 2000)
    const seen = new Set<string>()
    for (let n = 0; n < 8; n++) {
      apply(w, { type: 'tick', dt: 50 }, content)
      seen.add(etarp(w).facing)
    }
    expect(seen.size).toBe(4) // a quarter turn every 50 ms: every way round inside 400 ms
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('spin') // still going, and interact cannot skip it

    apply(w, { type: 'tick', dt: 1600 }, content)
    expect([etarp(w).spin, etarp(w).facing]).toEqual([undefined, 'down']) // back facing the player
    expect(w.dialogue?.node).toBe('here') // and straight on to his line
    expect(bar3(w).drink).toBe(true)
  })

  it('comes off the counter into the bag, leaving it bare', () => {
    const w = atBar()
    bar3(w).drink = true
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.otijom).toBe(1)
    expect(bar3(w).drink).toBeUndefined()
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'otijom' })
  })
})
