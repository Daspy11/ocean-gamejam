import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { homeChairs, makeSalt, useItem } from './salt'
import { createWorld, objectAt, type Content, type Item, type World } from './world'

const content: Content = { dialogues: {}, items: {} }

// stood on the grass at 16,14 with free grass on three sides, beauty showing, the bag open on one
// of `item`
function home(item: Item, score = 0): World {
  const w = createWorld()
  w.player = { ...w.player, x: 16, y: 14, facing: 'left' }
  w.inventory = { [item]: 1 }
  w.flags = { 'score:on': true, 'harry:ok': true }
  w.score = score
  w.menu = { screen: 'inventory', cursor: 0 }
  return w
}
// one more out of the bag, put down the way he faces
function put(w: World, item: Item, facing: 'left' | 'up' | 'right', c = content) {
  w.inventory[item] = 1
  w.menu = { screen: 'inventory', cursor: 0 }
  w.player.facing = facing
  apply(w, { type: 'interact' }, c)
}

describe('standing a prize on the ground', () => {
  it('stands the egg, the certificate and a chair in front of him for 5 each', () => {
    for (const item of ['egg', 'certificate', 'chair'] as const) {
      const w = home(item)
      apply(w, { type: 'interact' }, content)
      expect(objectAt(w, 15, 14)).toMatchObject({ kind: item, x: 15, y: 14 })
      expect([w.inventory[item], w.menu, w.score]).toEqual([0, null, 5])
      expect(w.pops.at(-1)).toEqual({ x: 15, y: 14, text: '+5', at: 0 })
    }
  })

  it('makes the last of the carpet, the egg and the certificate worth enough for 30', () => {
    // The last prize covers bridge costs, rounded up to the next five.
    const w = home('carpet', -4)
    apply(w, { type: 'interact' }, content)
    put(w, 'egg', 'up')
    expect(w.score).toBe(6)
    put(w, 'certificate', 'right')
    expect(w.score).toBe(31)
    expect(w.pops.at(-1)).toMatchObject({ x: 17, y: 14, text: '+25' })
  })

  it('does that whichever of the three comes last, and never less than 5', () => {
    const w = home('egg')
    apply(w, { type: 'interact' }, content)
    put(w, 'certificate', 'up')
    put(w, 'carpet', 'right')
    expect(w.score).toBe(30)
    const rich = home('certificate', 20)
    apply(rich, { type: 'interact' }, content)
    put(rich, 'carpet', 'up')
    put(rich, 'egg', 'right')
    expect(rich.score).toBe(34)
  })

  it('counts a prize as placed wherever it went down, though only home is worth anything', () => {
    const w = home('egg')
    w.player = { ...w.player, x: 33, y: 16, facing: 'right' } // the big island
    apply(w, { type: 'interact' }, content)
    expect([w.score, w.flags['placed:egg']]).toEqual([0, true])
  })

  it('takes a chair back up again for the 5 it was worth', () => {
    const w = home('chair')
    apply(w, { type: 'interact' }, content) // down at 15,14 for 5
    apply(w, { type: 'interact' }, content) // and straight back into the bag
    expect([objectAt(w, 15, 14), w.inventory.chair, w.score]).toEqual([undefined, 1, 0])
  })

  it('caps a chair before the last prize, and refunds only its actual beauty on pickup', () => {
    const w = home('chair', 28)
    apply(w, { type: 'interact' }, content)
    expect(w.score).toBe(29)
    expect(objectAt(w, 15, 14)).toMatchObject({ kind: 'chair', beauty: 1 })
    apply(w, { type: 'interact' }, content)
    expect(w.score).toBe(28)
    apply(w, { type: 'menu' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.score).toBe(29)
  })

  it.each([
    ['carpet', 'egg', 'certificate'],
    ['carpet', 'certificate', 'egg'],
    ['egg', 'carpet', 'certificate'],
    ['egg', 'certificate', 'carpet'],
    ['certificate', 'egg', 'carpet'],
    ['certificate', 'carpet', 'egg'],
  ] as const)('requires every prize in order %s, %s, %s, even with extra chairs', (...order) => {
    for (const start of [-100, -2, 8, 20, 28]) {
      const w = home(order[0], start)
      const c: Content = {
        items: {},
        dialogues: {
          seahorse: {
            name: '',
            trigger: { event: 'score:thirty' },
            start: [{ node: '1' }],
            nodes: { '1': { text: '[PLACEHOLDER arrival]' } },
          },
        },
      }
      apply(w, { type: 'interact' }, c)
      put(w, order[1], 'up')
      w.inventory.chair = 2 // a third never goes down
      for (const x of [15, 16]) {
        useItem(w, 'chair', x, 18)
        apply(w, { type: 'tick', dt: 16 }, c)
        expect(w.score).toBeLessThan(30)
        expect(w.dialogue).toBeNull()
      }
      put(w, order[2], 'right')
      apply(w, { type: 'tick', dt: 16 }, c)
      expect(w.score).toBeGreaterThanOrEqual(30)
      expect(w.score).toBeLessThan(35)
      expect(w.dialogue?.key).toBe('seahorse')
      expect(w.objects.some((o) => o.kind === 'egg')).toBe(true)
    }
  })

  it('keeps the short eastern bridge route below the threshold with just carpet and egg', () => {
    const w = home('carpet', 10)
    for (const x of [21, 22, 28, 29, 30, 31]) makeSalt(w, x, 16)
    expect(w.score).toBe(8)
    apply(w, { type: 'interact' }, content)
    put(w, 'egg', 'up')
    expect(w.score).toBe(18)
  })

  it('cannot start the finale from a high score with its egg still in the bag', () => {
    const w = home('egg', 30)
    w.menu = null
    w.objects.push(
      { id: 'rug', kind: 'floor', x: 15, y: 17 },
      { id: 'award', kind: 'certificate', x: 16, y: 18 },
    )
    const c: Content = {
      items: {},
      dialogues: {
        seahorse: {
          name: '',
          trigger: { event: 'score:thirty' },
          start: [{ node: '1' }],
          nodes: { '1': { text: '[PLACEHOLDER arrival]' } },
        },
      },
    }
    apply(w, { type: 'tick', dt: 16 }, c)
    expect(w.dialogue).toBeNull()
    expect(w.flags['fired:seahorse']).toBeUndefined()
  })
})

describe('a word over each thing stood at home', () => {
  // the shape of carpetdown.json and friends: one line each on its place:<item> event
  const c: Content = {
    items: {},
    dialogues: {
      carpetdown: {
        name: '',
        trigger: { event: 'place:carpet' },
        start: [{ node: '1' }],
        nodes: { '1': { text: '[PLACEHOLDER carpet]', next: null } },
      },
      chair1: {
        name: '',
        trigger: { event: 'place:chair:1' },
        start: [{ node: '1' }],
        nodes: { '1': { text: '[PLACEHOLDER first chair]', next: null } },
      },
      chair2: {
        name: '',
        trigger: { event: 'place:chair:2' },
        start: [{ node: '1' }],
        nodes: { '1': { text: '[PLACEHOLDER second chair]', next: null } },
      },
      chair3: {
        name: '',
        start: [{ node: '1' }],
        nodes: { '1': { text: '[PLACEHOLDER no more chairs]', next: null } },
      },
    },
  }
  const shut = (w: World) => apply(w, { type: 'interact' }, c)

  it('fires place:<item> for a prize stood on the main island, and not off it', () => {
    const w = home('carpet')
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.key).toBe('carpetdown')
    const away = home('carpet')
    away.player = { ...away.player, x: 33, y: 16, facing: 'right' } // the big island
    apply(away, { type: 'interact' }, c)
    expect([objectAt(away, 34, 16)?.kind, away.dialogue]).toEqual(['floor', null])
  })

  it('numbers the chairs by how many stand at home, and keeps the third in the bag', () => {
    const w = home('chair')
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.key).toBe('chair1')
    shut(w)
    put(w, 'chair', 'up', c)
    expect(w.dialogue?.key).toBe('chair2')
    shut(w)
    put(w, 'chair', 'right', c)
    expect([objectAt(w, 17, 14), w.inventory.chair, w.menu, w.dialogue?.key]).toEqual([
      undefined,
      1,
      null,
      'chair3',
    ])
    shut(w)
    put(w, 'chair', 'right', c) // and says so every time, not once
    expect(w.dialogue?.key).toBe('chair3')
    shut(w)
    apply(w, { type: 'interact' }, c) // one picked back up, facing right at an empty tile: nothing
    w.player.facing = 'left'
    apply(w, { type: 'interact' }, c) // the first chair back into the bag
    expect(homeChairs(w)).toBe(1)
    put(w, 'chair', 'right', c) // room for one again, though its line has been said
    expect([objectAt(w, 17, 14)?.kind, w.dialogue]).toEqual(['chair', null])
  })

  it("does not count harry's chairs on the big island", () => {
    const w = home('chair')
    expect(homeChairs(w)).toBe(0)
  })
})
