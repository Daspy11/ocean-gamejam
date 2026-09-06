import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { findPath } from './path'
import { createWorld, npc, type Content, type DialogueNode, type Obj, type World } from './world'

// a tiny world drawn by hand: `.` sand · `~` water · `^` rock. The player stands off in a corner
// unless a test moves him, and `a` is the one walking, whoever he is
function room(rows: string[], objects: Obj[] = []): World {
  const w = createWorld()
  w.width = rows[0].length
  w.height = rows.length
  const glyph = { '.': 'sand', '~': 'water', '^': 'rock' } as const
  w.tiles = rows.flatMap((row) => [...row].map((ch) => glyph[ch as keyof typeof glyph]))
  w.main = w.tiles.map(() => true)
  w.objects = objects
  w.player = { ...w.player, x: 0, y: 0, step: null, held: null }
  return w
}
const who = (sprite: string, x: number, y: number) => npc('a', sprite, x, y, 'down', 'mich')
const a = (w: World) => w.objects.find((o) => o.id === 'a')!

// a scene that is just the one walk: `a` goes to `to`, and a line follows
const scene = (walk: NonNullable<DialogueNode['walk']>): Content => ({
  dialogues: {
    go: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'walk' }],
      nodes: {
        walk: { walk, next: 'end' },
        end: { text: '[PLACEHOLDER go 1]', next: null },
      },
    },
  },
  items: {},
})
const go = (to: { x: number; y: number }) => scene({ id: 'a', to })
const upTo = (near: string) => scene({ id: 'a', near })

describe('finding a way', () => {
  it('takes the shortest way round a wall', () => {
    const w = room(['.....', '.^^^.', '.....'], [who('mich', 0, 1)])
    w.player = { ...w.player, x: 4, y: 2 }
    expect(findPath(w, a(w), { x: 4, y: 1 })).toEqual([
      'up',
      'right',
      'right',
      'right',
      'right',
      'down',
    ])
  })

  it('is no way at all when the tile cannot be reached, or is off the map', () => {
    const w = room(['.^.'], [who('mich', 0, 0)])
    expect(findPath(w, a(w), { x: 2, y: 0 })).toBe(null)
    expect(findPath(w, a(w), { x: 1, y: 0 })).toBe(null) // the rock itself
    expect(findPath(w, a(w), { x: 3, y: 0 })).toBe(null)
  })

  it('is nothing at all from the tile he is already on', () => {
    const w = room(['..'], [who('mich', 0, 0)])
    expect(findPath(w, a(w), { x: 0, y: 0 })).toEqual([])
  })

  it('goes round the player when it can, and through him when it must', () => {
    const w = room(['...', '...', '...'], [who('mich', 0, 1)])
    w.player = { ...w.player, x: 1, y: 1 }
    const round = findPath(w, a(w), { x: 2, y: 1 })!
    expect(round).toHaveLength(4)
    expect(round.filter((d) => d === 'right')).toHaveLength(2) // and never through 1,1

    const hall = room(['...'], [who('mich', 0, 0)])
    hall.player = { ...hall.player, x: 1, y: 0 }
    expect(findPath(hall, a(hall), { x: 2, y: 0 })).toEqual(['right', 'right'])
  })

  it('goes round another character, and prefers the player when it has to pass someone', () => {
    // two ways round the rock: past mich up top, past the player down below
    const w = room(
      ['...', '.^.', '...'],
      [who('walter', 0, 1), npc('m', 'mich', 1, 0, 'down', 'mich')],
    )
    w.player = { ...w.player, x: 1, y: 2 }
    expect(findPath(w, a(w), { x: 2, y: 1 })).toEqual(['down', 'right', 'right', 'up'])

    const hall = room(['....'], [who('walter', 0, 0), npc('m', 'mich', 1, 0, 'down', 'mich')])
    hall.player = { ...hall.player, x: 3, y: 0 }
    expect(findPath(hall, a(hall), { x: 3, y: 0 })).toEqual(['right', 'right']) // no other way
  })

  it('is stopped by a solid object and not by a floor', () => {
    const crate: Obj = { id: 'c', kind: 'crate', x: 1, y: 0, open: true, item: 'orb' }
    const w = room(['...'], [who('mich', 0, 0), crate])
    expect(findPath(w, a(w), { x: 2, y: 0 })).toBe(null)
    const floor = room(['...'], [who('mich', 0, 0), { id: 'f', kind: 'floor', x: 1, y: 0 }])
    expect(findPath(floor, a(floor), { x: 2, y: 0 })).toEqual(['right', 'right'])
  })

  it('keeps a walker off the water, lets a swimmer through it, and stops both at rock', () => {
    const sea = (sprite: string) => room(['.~.'], [who(sprite, 0, 0)])
    expect(findPath(sea('mich'), a(sea('mich')), { x: 2, y: 0 })).toBe(null)
    expect(findPath(sea('seahorse'), a(sea('seahorse')), { x: 2, y: 0 })).toEqual([
      'right',
      'right',
    ])
    const cliff = room(['.^.'], [who('seahorse', 0, 0)])
    expect(findPath(cliff, a(cliff), { x: 2, y: 0 })).toBe(null)
  })

  it('lets a flyer over water, rock, objects and the player, but not another flyer', () => {
    const tree: Obj = { id: 't', kind: 'tree', x: 3, y: 0 }
    const w = room(['.~^...'], [who('albatross', 0, 0), tree])
    w.player = { ...w.player, x: 4, y: 0 }
    expect(findPath(w, a(w), { x: 5, y: 0 })).toEqual(['right', 'right', 'right', 'right', 'right'])

    const pair = room(
      ['...', '...'],
      [who('albatross', 0, 0), npc('b', 'albatross', 1, 0, 'down', 'mich')],
    )
    expect(findPath(pair, a(pair), { x: 2, y: 0 })).toEqual(['down', 'right', 'right', 'up'])
  })

  it('ends beside whoever stands on the goal, on the closest free tile it can reach', () => {
    const w = room(['.....'], [who('mich', 0, 0)])
    w.player = { ...w.player, x: 4, y: 0 }
    expect(findPath(w, a(w), { x: 4, y: 0 })).toEqual(['right', 'right', 'right'])
    // the tile before him is taken too, so the free one beneath him beats pushing past
    const two = room(
      ['.....', '.....'],
      [who('mich', 0, 0), npc('m', 'mich', 3, 0, 'down', 'mich')],
    )
    two.player = { ...two.player, x: 4, y: 0 }
    const steps = findPath(two, a(two), { x: 4, y: 0 })!
    expect(steps).toHaveLength(5) // to 4,1
    expect(steps.filter((d) => d === 'down')).toEqual(['down'])
    // nothing next to him can be reached: the closest tile there is, and no step at all from it
    const wall = room(['.^.'], [who('mich', 0, 0)])
    wall.player = { ...wall.player, x: 2, y: 0 }
    expect(findPath(wall, a(wall), { x: 2, y: 0 })).toEqual([])
    const other = room(['...'], [who('mich', 0, 0), npc('m', 'mich', 2, 0, 'down', 'mich')])
    expect(findPath(other, a(other), { x: 2, y: 0 })).toEqual(['right'])
  })

  it('lets a walker and a flyer pass each other by', () => {
    const w = room(['...', '...'], [who('mich', 0, 0), npc('b', 'albatross', 1, 0, 'down', 'mich')])
    expect(findPath(w, a(w), { x: 2, y: 0 })).toEqual(['right', 'right'])
    const up = room(
      ['...', '...'],
      [who('albatross', 0, 0), npc('b', 'mich', 1, 0, 'down', 'mich')],
    )
    expect(findPath(up, a(up), { x: 2, y: 0 })).toEqual(['right', 'right'])
  })
})

describe('a walk act with a to', () => {
  it('walks him there by the way found and moves the scene on when he arrives', () => {
    const w = room(['.....', '.^^^.', '.....'], [who('mich', 0, 1)])
    w.player = { ...w.player, x: 4, y: 2 }
    apply(w, { type: 'talk', key: 'go' }, go({ x: 4, y: 1 }))
    expect(a(w).step).toEqual({ x: 0, y: 0, t: 0 })
    for (let n = 0; n < 6; n++) apply(w, { type: 'tick', dt: 250 }, go({ x: 4, y: 1 }))
    expect(a(w)).toMatchObject({ x: 4, y: 1, facing: 'down', step: null, path: [] })
    expect(w.dialogue?.node).toBe('end')
  })

  it('stops beside somebody standing on the tile and turns to face him', () => {
    const w = room(['.....', '.....'], [who('mich', 0, 0), npc('m', 'mich', 3, 0, 'down', 'mich')])
    w.player = { ...w.player, x: 4, y: 0 }
    const c = go({ x: 4, y: 0 })
    apply(w, { type: 'talk', key: 'go' }, c)
    for (let n = 0; n < 5; n++) apply(w, { type: 'tick', dt: 250 }, c)
    expect(a(w)).toMatchObject({ x: 4, y: 1, facing: 'up', step: null, path: [] })
    expect(w.dialogue?.node).toBe('end')
  })

  it('faces him from where he stands when nothing closer can be reached', () => {
    const w = room(['.^.', '...'], [who('mich', 0, 0)])
    w.player = { ...w.player, x: 2, y: 0 }
    const c = go({ x: 2, y: 0 })
    apply(w, { type: 'talk', key: 'go' }, c)
    for (let n = 0; n < 3; n++) apply(w, { type: 'tick', dt: 250 }, c)
    expect(a(w)).toMatchObject({ x: 2, y: 1, facing: 'up', path: [] })
    const boxed = room(['.^.'], [who('mich', 0, 0)])
    boxed.player = { ...boxed.player, x: 2, y: 0 }
    apply(boxed, { type: 'talk', key: 'go' }, c)
    expect(a(boxed)).toMatchObject({ x: 0, y: 0, facing: 'right', path: [] })
    apply(boxed, { type: 'tick', dt: 16 }, c)
    expect(boxed.dialogue?.node).toBe('end')
  })

  it('leaves him where he stands when there is no way there, and the act is over', () => {
    const w = room(['.^.'], [who('mich', 0, 0)])
    const c = go({ x: 2, y: 0 })
    apply(w, { type: 'talk', key: 'go' }, c)
    expect(a(w)).toMatchObject({ x: 0, y: 0, facing: 'down', path: [] })
    expect(a(w).step).toBeFalsy()
    apply(w, { type: 'tick', dt: 16 }, c)
    expect(a(w)).toMatchObject({ x: 0, y: 0 })
    expect(w.dialogue?.node).toBe('end')
  })
})

describe('a walk act with a near', () => {
  it('walks up to the player, stops on the tile before him and turns to face him', () => {
    const w = room(['.....'], [who('mich', 0, 0)])
    w.player = { ...w.player, x: 4, y: 0 }
    const c = upTo('player')
    apply(w, { type: 'talk', key: 'go' }, c)
    for (let n = 0; n < 4; n++) apply(w, { type: 'tick', dt: 250 }, c)
    expect(a(w)).toMatchObject({ x: 3, y: 0, facing: 'right', step: null, path: [] })
    expect(w.dialogue?.node).toBe('end')
  })

  it('walks up to something solid, which no `to` could ever reach', () => {
    const boat: Obj = { id: 'b', kind: 'boat', x: 3, y: 0 }
    const w = room(['.....'], [who('mich', 0, 0), boat])
    const c = upTo('b')
    expect(findPath(w, a(w), boat)).toBe(null) // the boat is a wall to a `to`
    apply(w, { type: 'talk', key: 'go' }, c)
    for (let n = 0; n < 3; n++) apply(w, { type: 'tick', dt: 250 }, c)
    expect(a(w)).toMatchObject({ x: 2, y: 0, facing: 'right', path: [] })
    expect(w.dialogue?.node).toBe('end')
  })

  it('turns to face somebody he is already standing beside without moving', () => {
    const w = room(['...'], [who('mich', 1, 0)])
    w.player = { ...w.player, x: 0, y: 0 }
    const c = upTo('player')
    apply(w, { type: 'talk', key: 'go' }, c)
    expect(a(w)).toMatchObject({ x: 1, y: 0, facing: 'left', path: [] })
    apply(w, { type: 'tick', dt: 16 }, c)
    expect(w.dialogue?.node).toBe('end')
  })

  it('leaves him where he stands when there is nobody of that name', () => {
    const w = room(['...'], [who('mich', 0, 0)])
    const c = upTo('nobody')
    apply(w, { type: 'talk', key: 'go' }, c)
    expect(a(w)).toMatchObject({ x: 0, y: 0, facing: 'down', path: [] })
    apply(w, { type: 'tick', dt: 16 }, c)
    expect(w.dialogue?.node).toBe('end')
  })
})

describe('a walk act with a facing', () => {
  const face = (to: { x: number; y: number }): Content => ({
    dialogues: {
      go: {
        name: '[PLACEHOLDER NPC NAME]',
        start: [{ node: 'walk' }],
        nodes: {
          walk: { walk: { id: 'a', to, facing: 'up' }, next: 'end' },
          end: { text: '[PLACEHOLDER go 1]', next: null },
        },
      },
    },
    items: {},
  })

  it('turns him that way once he is there, whichever way the last step went', () => {
    const w = room(['...'], [who('mich', 0, 0)])
    apply(w, { type: 'talk', key: 'go' }, face({ x: 2, y: 0 }))
    apply(w, { type: 'tick', dt: 250 }, face({ x: 2, y: 0 }))
    expect(a(w)).toMatchObject({ facing: 'right' }) // still on his way
    apply(w, { type: 'tick', dt: 250 }, face({ x: 2, y: 0 }))
    expect(a(w)).toMatchObject({ x: 2, y: 0, facing: 'up' })
    expect(a(w)).not.toHaveProperty('face')
  })

  it('turns at once when he is there already, and not at all when he cannot get there', () => {
    const here = room(['..'], [who('mich', 0, 0)])
    apply(here, { type: 'talk', key: 'go' }, face({ x: 0, y: 0 }))
    expect(a(here)).toMatchObject({ facing: 'up' })
    const wall = room(['.^.'], [who('mich', 0, 0)])
    apply(wall, { type: 'talk', key: 'go' }, face({ x: 2, y: 0 }))
    expect(a(wall)).toMatchObject({ facing: 'down' })
  })
})
