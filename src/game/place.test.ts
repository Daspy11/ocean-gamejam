import { describe, expect, it } from 'vitest'
import { apply } from './actions'
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
function put(w: World, item: Item, facing: 'left' | 'up' | 'right') {
  w.inventory[item] = 1
  w.menu = { screen: 'inventory', cursor: 0 }
  w.player.facing = facing
  apply(w, { type: 'interact' }, content)
}

describe('standing a prize on the ground', () => {
  it('stands the egg, the certificate and a deck chair in front of him for 5 each', () => {
    for (const item of ['egg', 'certificate', 'chair'] as const) {
      const w = home(item)
      apply(w, { type: 'interact' }, content)
      expect(objectAt(w, 15, 14)).toMatchObject({ kind: item, x: 15, y: 14 })
      expect([w.inventory[item], w.menu, w.score]).toEqual([0, null, 5])
      expect(w.pops.at(-1)).toEqual({ x: 15, y: 14, text: '+5', at: 0 })
    }
  })

  it('makes the last of the carpet, the egg and the certificate worth enough for 15', () => {
    // four blocks of salt in the hole: -4, then 5 and 5, and the certificate has to be 10
    const w = home('carpet', -4)
    apply(w, { type: 'interact' }, content)
    put(w, 'egg', 'up')
    expect(w.score).toBe(6)
    put(w, 'certificate', 'right')
    expect(w.score).toBe(16)
    expect(w.pops.at(-1)).toMatchObject({ x: 17, y: 14, text: '+10' })
  })

  it('does that whichever of the three comes last, and never less than 5', () => {
    const w = home('egg')
    apply(w, { type: 'interact' }, content)
    put(w, 'certificate', 'up')
    put(w, 'carpet', 'right') // exactly 15 from 10: the plain 5 already does it
    expect(w.score).toBe(15)
    const rich = home('certificate', 20)
    apply(rich, { type: 'interact' }, content)
    put(rich, 'carpet', 'up')
    put(rich, 'egg', 'right')
    expect(rich.score).toBe(35)
  })

  it('counts a prize as placed wherever it went down, though only home is worth anything', () => {
    const w = home('egg')
    w.player = { ...w.player, x: 33, y: 16, facing: 'right' } // the big island
    apply(w, { type: 'interact' }, content)
    expect([w.score, w.flags['placed:egg']]).toEqual([0, true])
  })

  it('takes a deck chair back up again for the 5 it was worth', () => {
    const w = home('chair')
    apply(w, { type: 'interact' }, content) // down at 15,14 for 5
    apply(w, { type: 'interact' }, content) // and straight back into the bag
    expect([objectAt(w, 15, 14), w.inventory.chair, w.score]).toEqual([undefined, 1, 0])
  })
})
