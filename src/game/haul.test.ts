import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileIndex, type Content, type World } from './world'

// the two boxes Walter uses over loot; the real lines live in assets/dialogue
const content: Content = {
  dialogues: {
    haul: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'haul', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER what a haul, by pressing i then hitting e]', next: null },
      },
    },
    notsofast: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER not so fast]', next: null } },
    },
  },
  items: {},
}

// the two-tile bridge east: 21,16 and 22,16 are crust joined to the main island, and 23,16 is the
// small island's sand, which beauty never counts
function bridged(x: number, facing: 'left' | 'right'): World {
  const w = createWorld()
  for (const at of [21, 22]) {
    w.tiles[tileIndex(w, at, 16)] = 'salt'
    w.main[tileIndex(w, at, 16)] = true
  }
  Object.assign(w.player, { x, y: 16, facing })
  w.inventory = { egg: 1 }
  w.flags = { 'score:on': true, 'had:egg': true }
  return w
}

// hold the way he faces and walk a whole tile
function walk(w: World, dir: 'left' | 'right') {
  apply(w, { type: 'move', dir }, content)
  apply(w, { type: 'tick', dt: 100 }, content)
  apply(w, { type: 'tick', dt: 217 }, content)
}

describe('loot on the island', () => {
  it('stops him walking off the island with a prize, and lets him go once it is down', () => {
    const w = bridged(22, 'right')
    walk(w, 'right')
    expect(w.dialogue?.key).toBe('notsofast')
    expect(w.player).toMatchObject({ x: 22, y: 16, step: null, held: null })
    apply(w, { type: 'interact' }, content) // close the box, stand the egg down, and off he goes
    w.inventory = {}
    walk(w, 'right')
    expect(w.player.x).toBe(23)
    expect(w.dialogue).toBeNull()
  })

  it('says it again on the next try, and never over an open box', () => {
    const w = bridged(22, 'right')
    walk(w, 'right')
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBeNull()
    walk(w, 'right')
    expect(w.dialogue?.key).toBe('notsofast')
    expect(w.queue).toEqual([])
  })

  it('leaves a chair, the sea and the way home alone', () => {
    const chair = bridged(22, 'right')
    chair.inventory = { chair: 1 } // the shrimp is owed one, so it may leave the island
    walk(chair, 'right')
    expect(chair.player.x).toBe(23)

    const sea = bridged(20, 'right') // 21,16 is water again: nothing to block, he just cannot go
    sea.tiles[tileIndex(sea, 21, 16)] = 'water'
    sea.main[tileIndex(sea, 21, 16)] = false
    walk(sea, 'right')
    expect(sea.dialogue).toBeNull()
    expect(sea.player.x).toBe(20)

    const back = bridged(22, 'left')
    walk(back, 'left')
    expect(back.player.x).toBe(21)
    expect(back.dialogue).toBeNull()
  })

  it('has Walter smell the haul the first time it comes home, once only', () => {
    const w = bridged(23, 'left')
    walk(w, 'left')
    expect(w.player).toMatchObject({ x: 22, step: null })
    expect(w.dialogue?.key).toBe('haul')
    expect(w.typing?.text).toBe('[PLACEHOLDER what a haul, by pressing I then hitting E]')
    apply(w, { type: 'interact' }, content)
    Object.assign(w.player, { x: 23, facing: 'left' })
    walk(w, 'left')
    expect(w.dialogue).toBeNull()
  })

  it('says nothing when he comes home empty-handed or before Walter is about', () => {
    const empty = bridged(23, 'left')
    empty.inventory = {}
    walk(empty, 'left')
    expect(empty.dialogue).toBeNull()

    const early = bridged(23, 'left')
    early.flags = {}
    walk(early, 'left')
    expect(early.dialogue).toBeNull()
  })

  it('names the buttons the title picked in the tutorial line', () => {
    const w = bridged(23, 'left')
    w.controls = { confirm: 'Cross', inventory: 'Triangle' }
    walk(w, 'left')
    expect(w.typing?.text).toBe(
      '[PLACEHOLDER what a haul, by pressing Triangle then hitting Cross]',
    )
  })
})
