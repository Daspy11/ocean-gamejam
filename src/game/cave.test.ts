import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type Dir, type World } from './world'

// the cave mouths that link the big island to the room under the map, and the rack inside it
const content: Content = { dialogues: {}, items: {} }

function at(x: number, y: number, facing: Dir): World {
  const w = createWorld()
  w.player = { ...w.player, x, y, facing }
  return w
}

describe('the cave', () => {
  it('puts the player down at the far end of the mouth he steps onto', () => {
    // standing on a forest tile is fine for a loaded world; only stepping into one is blocked
    const w = at(42, 18, 'up') // cave1 sits on the clear tile at 42,17
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([10, 40, 'up'])

    const back = at(10, 40, 'down') // and caveout at 10,41 brings him back below the mouth
    apply(back, { type: 'move', dir: 'down' }, content)
    apply(back, { type: 'tick', dt: 250 }, content)
    expect([back.player.x, back.player.y, back.player.facing]).toEqual([42, 18, 'down'])
    expect(back.player.step).toBe(null) // the tree at 42,19 stops the held key going any further
  })
})

// the got box itself is dialogue.test.ts's job; the rack only needs it to exist to open one
const gotBox: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
  },
  items: {},
}

describe('the coat rack', () => {
  it('is carried off whole, and leaves an empty tile behind', () => {
    const w = at(10, 38, 'up') // rack1 at 10,37, at the top of the cave room
    apply(w, { type: 'interact' }, gotBox)
    expect(w.inventory).toEqual({ hatrack: 1 })
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'hatrack' })
    expect(w.objects.some((o) => o.id === 'rack1')).toBe(false)

    apply(w, { type: 'interact' }, gotBox) // dismiss the got box
    const before = w.rev
    apply(w, { type: 'interact' }, gotBox) // bare sand now: there is nothing left to take
    expect(w.rev).toBe(before)
    expect(w.inventory).toEqual({ hatrack: 1 })
  })
})
