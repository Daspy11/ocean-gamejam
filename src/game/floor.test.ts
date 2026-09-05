import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, objectAt, type Content, type World } from './world'

// only the boxes using an item can open; the real lines live in assets/dialogue
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    insalting: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'salt:place', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER insalting]', next: null } },
    },
    away: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'salt:away', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER only the main island counts]', next: null } },
    },
  },
  items: { carpet: { name: '[PLACEHOLDER carpet]' } },
}

// on the east shore at 20,16 (sand, grass inland at 19,16 and open sea at 21,16), bag open on the
// one carpet in it and beauty already showing
function home(): World {
  const w = createWorld()
  w.player = { ...w.player, x: 20, y: 16, facing: 'left' }
  w.inventory = { carpet: 1 }
  w.flags = { 'score:on': true, 'had:carpet': true }
  w.menu = { screen: 'inventory', cursor: 0 }
  return w
}

describe('using an item out of the bag', () => {
  it('puts the carpet down in front of him, worth 5, and shuts the bag to show it', () => {
    const w = home()
    apply(w, { type: 'interact' }, content)
    expect(objectAt(w, 19, 16)).toMatchObject({ kind: 'floor', x: 19, y: 16 })
    expect([w.inventory.carpet, w.menu, w.score]).toEqual([0, null, 5])
    expect(w.pops.at(-1)).toEqual({ x: 19, y: 16, text: '+5', at: 0 })
    expect(w.dialogue).toBe(null) // nothing to say about a carpet laid at home
  })

  it('lays it on any ground he could walk on, and nowhere else', () => {
    for (const [facing, x, y] of [
      ['left', 19, 16], // grass, inland
      ['up', 20, 15], // sand, along the beach
    ] as const) {
      const w = home()
      w.player.facing = facing
      apply(w, { type: 'interact' }, content)
      expect(objectAt(w, x, y)?.kind).toBe('floor')
    }
    const w = home() // 21,16 is the open sea he throws the orb into
    w.player.facing = 'right'
    apply(w, { type: 'interact' }, content)
    expect([w.objects.some((o) => o.kind === 'floor'), w.inventory.carpet]).toEqual([false, 1])
    expect(w.menu).not.toBe(null) // nothing happened, so the bag stays open
  })

  it('will not stack one on something already standing there', () => {
    const w = home()
    w.player = { ...w.player, x: 15, y: 16, facing: 'right' } // tree1 stands on 16,16
    apply(w, { type: 'interact' }, content)
    expect([w.inventory.carpet, w.score, w.menu?.cursor]).toEqual([1, 0, 0])
  })

  it('is walked over rather than bumped into', () => {
    const w = home()
    apply(w, { type: 'interact' }, content) // down on the grass at 19,16
    apply(w, { type: 'move', dir: 'left' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y]).toEqual([19, 16])
  })

  it('is worth nothing out at sea, and Walter says so once', () => {
    const w = home()
    w.player = { ...w.player, x: 33, y: 16, facing: 'right' } // the big island, nowhere near home
    w.inventory.carpet = 2
    apply(w, { type: 'interact' }, content)
    expect([w.score, w.pops.length]).toEqual([0, 0])
    expect(w.dialogue?.key).toBe('away')

    apply(w, { type: 'interact' }, content) // dismiss it
    w.menu = { screen: 'inventory', cursor: 0 }
    w.player.facing = 'down'
    apply(w, { type: 'interact' }, content)
    expect([w.objects.filter((o) => o.kind === 'floor').length, w.dialogue]).toEqual([2, null])
  })

  it('throws the orb at the water in front of him and shuts the bag', () => {
    const w = home()
    w.inventory = { orb: 1 }
    w.player.facing = 'right' // open sea at 21,16
    apply(w, { type: 'interact' }, content)
    expect(w.objects.at(-1)).toMatchObject({ kind: 'orb', x: 21, y: 16, doneAt: 2000 })
    expect([w.inventory.orb, w.menu]).toEqual([0, null])
  })

  it('lays a block from the salt slot, complaint and all', () => {
    const w = home()
    w.inventory = { salt: 1 }
    w.player.facing = 'right'
    apply(w, { type: 'interact' }, content)
    expect([w.tiles[16 * w.width + 21], w.score, w.menu]).toEqual(['salt', -1, null])
    expect(w.dialogue?.key).toBe('insalting')
  })

  it('does nothing at all for an item that goes nowhere', () => {
    const w = home()
    w.inventory = { twig: 3 }
    apply(w, { type: 'interact' }, content)
    expect([w.inventory.twig, w.menu?.cursor, w.objects.length]).toEqual([
      3,
      0,
      createWorld().objects.length,
    ])
  })

  it('uses the slot the cursor is on, not the first one', () => {
    const w = home()
    w.inventory = { twig: 1, carpet: 1 }
    apply(w, { type: 'move', dir: 'right' }, content)
    expect(w.menu?.cursor).toBe(1)
    apply(w, { type: 'interact' }, content)
    expect(objectAt(w, 19, 16)?.kind).toBe('floor')
  })
})
