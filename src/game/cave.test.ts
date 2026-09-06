import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type Dir, type World } from './world'

// the cave mouths that link the big island to the room under the map, the gate on the corridor down
// to the mouth, and the bottle of rum inside
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    gate: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER locked]', next: null } },
    },
  },
  items: {},
}

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
    expect(back.player.step).toEqual({ x: 42, y: 19, t: 0 }) // and on down the corridor
  })
})

describe('the gate', () => {
  it('only says locked without the key, and stays across the way', () => {
    const w = at(42, 22, 'up') // gate1 at 42,21, the south end of the corridor to the mouth
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('gate')
    apply(w, { type: 'interact' }, content) // dismiss it
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.y, w.player.step]).toEqual([22, null])
  })

  it('opens for the key, which it keeps, and the corridor runs up to the mouth', () => {
    const w = at(42, 22, 'up')
    w.inventory.key = 1
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.key).toBeUndefined()
    expect(w.objects.some((o) => o.id === 'gate1')).toBe(false)
    expect(w.dialogue).toBeNull()

    apply(w, { type: 'move', dir: 'up' }, content)
    for (let n = 0; n < 5; n++) apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y]).toEqual([10, 40]) // four tiles of corridor, then the mouth
  })
})

describe('the bottle of rum', () => {
  it('is carried off whole, and leaves an empty tile behind', () => {
    const w = at(10, 38, 'up') // rum1 at 10,37, at the top of the cave room
    apply(w, { type: 'interact' }, content)
    expect(w.inventory).toEqual({ rum: 1 })
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'rum' })
    expect(w.objects.some((o) => o.id === 'rum1')).toBe(false)

    apply(w, { type: 'interact' }, content) // dismiss the got box
    const before = w.rev
    apply(w, { type: 'interact' }, content) // bare sand now: there is nothing left to take
    expect(w.rev).toBe(before)
    expect(w.inventory).toEqual({ rum: 1 })
  })
})
