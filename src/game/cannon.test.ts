import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { blast } from './machine'
import { findPath } from './path'
import { createWorld, npc, type Content, type Obj, type World } from './world'

// a tiny world drawn by hand: `#` grass · `.` sand · `s` salt · `~` water. Beauty is showing, and
// the player stands in the far corner
function room(rows: string[], objects: Obj[] = []): World {
  const w = createWorld()
  w.width = rows[0].length
  w.height = rows.length
  const glyph = { '#': 'grass', '.': 'sand', s: 'salt', '~': 'water' } as const
  w.tiles = rows.flatMap((row) => [...row].map((ch) => glyph[ch as keyof typeof glyph]))
  w.main = w.tiles.map((t) => t !== 'water')
  w.objects = objects
  w.flags = { 'score:on': true }
  w.player = { ...w.player, x: rows[0].length - 1, y: rows.length - 1, step: null, held: null }
  return w
}
const at = (w: World, id: string) => w.objects.find((o) => o.id === id)!
const has = (w: World, kind: string) => w.objects.some((o) => o.kind === kind)
const charred = (w: World) => w.tiles.filter((t) => t === 'charred').length

const content: Content = {
  dialogues: {
    shove: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'walk' }],
      nodes: {
        walk: {
          walk: {
            id: 'a',
            path: ['right', 'right', 'up', 'right'],
            facing: 'down',
            push: 'cannon',
          },
          next: 'end',
        },
        end: { text: '[PLACEHOLDER shove 1]', next: null },
      },
    },
    boom: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'fire' }],
      nodes: {
        fire: { fire: 'cannon', next: 'end' },
        end: { text: '[PLACEHOLDER boom 1]', next: null },
      },
    },
    // a line for somebody stood in the way, and a wait until he has moved out of it
    duck: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ in: { x: 0, y: 0, w: 2, h: 2 }, node: 'line' }, { node: 'end' }],
      nodes: {
        line: { text: '[PLACEHOLDER duck 1]', next: 'hold' },
        hold: { clear: { x: 0, y: 0, w: 2, h: 2 }, next: 'end' },
        end: { text: '[PLACEHOLDER duck 2]', next: null },
      },
    },
    // a scene waiting for another box to shut, and the one it waits on
    after: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'done:first' },
      start: [{ node: '1' }],
      nodes: { 1: { text: '[PLACEHOLDER after 1]', next: null } },
    },
    first: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { 1: { text: '[PLACEHOLDER first 1]', next: null } },
    },
    // the same event, but not once the `unless` flag is up
    hush: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'done:first', unless: 'quiet' },
      start: [{ node: '1' }],
      nodes: { 1: { text: '[PLACEHOLDER hush 1]', next: null } },
    },
  },
  items: {},
}

describe('pushing something along', () => {
  it('leads him by a step round every corner and swings out to face his way at the end', () => {
    const w = room(
      ['######', '######'],
      [npc('a', 'mich', 0, 1, 'right', 'mich'), { id: 'cannon', kind: 'cannon', x: 1, y: 1 }],
    )
    apply(w, { type: 'talk', key: 'shove' }, content)
    expect(at(w, 'a').push).toBe('cannon')

    const seen: string[] = []
    for (let n = 0; n < 12; n++) {
      apply(w, { type: 'tick', dt: 125 }, content)
      const [me, it] = [at(w, 'a'), at(w, 'cannon')]
      if (!me.step) continue
      // it is stepping out of the tile he is stepping into, in time with him
      expect([it.x, it.y, it.step?.t]).toEqual([me.step.x, me.step.y, me.step.t])
      seen.push(`${it.x},${it.y}>${it.step?.x},${it.step?.y}`)
    }
    // the corner up at 2,1 and the turn down at the end, as he is to face down when he stops
    expect([...new Set(seen)]).toEqual(['1,1>2,1', '2,1>2,0', '2,0>3,0', '3,0>3,1'])
    const me = at(w, 'a')
    expect([me.x, me.y, me.kind === 'npc' && me.facing]).toEqual([3, 0, 'down'])
    expect([at(w, 'cannon').x, at(w, 'cannon').y]).toEqual([3, 1]) // in front of him, where he looks
    expect(at(w, 'cannon').step).toBe(null)
    expect(at(w, 'a').push).toBeUndefined()
    expect(w.dialogue?.node).toBe('end') // the walk act moved the scene on
  })

  it('is never a wall to the one pushing it', () => {
    const me = npc('a', 'mich', 0, 0, 'right', 'mich')
    const w = room(['####'], [me, { id: 'cannon', kind: 'cannon', x: 1, y: 0 }])
    expect(findPath(w, me, { x: 2, y: 0 })).toBe(null) // solid, and no way round it in a corridor
    me.push = 'cannon'
    expect(findPath(w, me, { x: 2, y: 0 })).toEqual(['right', 'right'])
  })
})

// two rows of grass off a sandy point on the east, the cannon on the sand and things standing about
// on the grass, none of which it touches
function island(): World {
  return room(
    ['#####.', '#####.'],
    [
      { id: 'cannon', kind: 'cannon', x: 5, y: 0 },
      { id: 'crate1', kind: 'crate', x: 2, y: 0, open: false, item: 'orb' },
      { id: 'tree1', kind: 'tree', x: 4, y: 1 },
      { id: 'orb1', kind: 'orb', x: 0, y: 0, doneAt: 0 },
      npc('mich', 'mich', 1, 1, 'down', 'mich'),
    ],
  )
}

describe('the cannon', () => {
  it('puts a ball out of the muzzle every 20 ms in a cone to the left, for show', () => {
    const w = island()
    apply(w, { type: 'talk', key: 'boom' }, content)
    const f = at(w, 'cannon').kind === 'cannon' ? at(w, 'cannon') : null
    expect(f?.kind === 'cannon' && f.firing).toMatchObject({ until: 4000, ballAt: 0 })
    apply(w, { type: 'tick', dt: 250 }, content)
    const flying = w.objects.filter((o) => o.kind === 'ball')
    expect(flying.length).toBe(13) // 0, 20 .. 240
    expect(flying[0]).toMatchObject({ id: 'ball:cannon:0', x: 5, y: 0, at: 0 }) // from the muzzle
    for (const b of flying) if (b.kind === 'ball') expect(Math.abs(b.dir)).toBeLessThanOrEqual(15)
    expect(new Set(flying.map((b) => b.kind === 'ball' && b.dir)).size).toBeGreaterThan(1) // sprayed

    apply(w, { type: 'tick', dt: 1250 }, content)
    expect(w.objects.some((o) => o.id === 'ball:cannon:0')).toBe(false) // 1500 ms: gone
    expect(w.objects.filter((o) => o.kind === 'ball').length).toBe(75) // 20 .. 1500 still up
  })

  it('is over after its 4 s with nothing on the island touched, and moves the scene on', () => {
    const w = island()
    apply(w, { type: 'talk', key: 'boom' }, content)
    for (let n = 0; n < 100 && w.dialogue?.node === 'fire'; n++)
      apply(w, { type: 'tick', dt: 100 }, content)
    expect([w.time, w.dialogue?.node]).toEqual([4000, 'end']) // over with the last ball out
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect(has(w, 'ball')).toBe(false)
    expect(['crate', 'tree', 'npc', 'cannon', 'orb'].map((k) => has(w, k))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
    // the cannon still burns and breaks nothing; the only mark it leaves is the balls stuck in the ground
    expect(charred(w)).toBe(0)
    const stuck = w.objects.filter((o) => o.kind === 'embedded')
    expect(w.score).toBe(stuck.length * -3)
  })

  it('sprays the same angles from the same seed', () => {
    const dirs = () => {
      const w = island()
      apply(w, { type: 'talk', key: 'boom' }, content)
      apply(w, { type: 'tick', dt: 250 }, content)
      return w.objects.map((b) => b.kind === 'ball' && b.dir)
    }
    expect(dirs()).toEqual(dirs())
  })
})

describe('cannonballs stuck in the island', () => {
  // a long grass room with the cannon on the east end, so the cone has room to spread
  const range = () =>
    room(
      [
        '####################',
        '####################',
        '###################~',
        '####################',
        '####################',
      ],
      [
        { id: 'cannon', kind: 'cannon', x: 19, y: 2 },
        { id: 'tree1', kind: 'tree', x: 17, y: 2 },
      ],
    )

  it('buries one every so often down the cone and takes 3 beauty for each', () => {
    const w = range()
    apply(w, { type: 'talk', key: 'boom' }, content)
    for (let n = 0; n < 40 && w.dialogue?.node === 'fire'; n++)
      apply(w, { type: 'tick', dt: 100 }, content)

    const stuck = w.objects.filter((o) => o.kind === 'embedded')
    expect(stuck.length).toBeGreaterThan(2) // a bunch of them, not one and not the whole cone
    expect(new Set(stuck.map((o) => `${o.x},${o.y}`)).size).toBe(stuck.length) // one to a tile
    expect(new Set(stuck.map((o) => o.y)).size).toBeGreaterThan(1) // sprayed, not a single row
    for (const o of stuck) {
      const d = 19 - o.x
      expect(d).toBeGreaterThan(0) // all of them out to the left of the muzzle
      expect(Math.abs(o.y - 2)).toBeLessThanOrEqual(Math.round(d * Math.tan((15 * Math.PI) / 180)))
      expect(w.tiles[o.y * w.width + o.x]).not.toBe('water') // nothing sticks in the sea
    }
    expect(w.score).toBe(stuck.length * -3)
    expect(at(w, 'tree1').kind).toBe('tree') // 17,2 is dead ahead, and still the tree's tile
    expect(w.objects.some((o) => o.kind === 'embedded' && o.x === 17 && o.y === 2)).toBe(false)
  })

  it('leaves the same ones from the same seed, and none at all until it fires', () => {
    const dig = () => {
      const w = range()
      apply(w, { type: 'talk', key: 'boom' }, content)
      for (let n = 0; n < 40 && w.dialogue?.node === 'fire'; n++)
        apply(w, { type: 'tick', dt: 100 }, content)
      return w.objects.filter((o) => o.kind === 'embedded').map((o) => `${o.x},${o.y}`)
    }
    expect(dig()).toEqual(dig())
    const quiet = range()
    apply(quiet, { type: 'tick', dt: 4000 }, content)
    expect(has(quiet, 'embedded')).toBe(false)
  })
})

describe('asking him out of the way', () => {
  it('holds with the box down until he has walked out of the rect, and only walking gets through', () => {
    const w = room(['####', '####', '####', '####'])
    w.player = { ...w.player, x: 1, y: 1, facing: 'right' } // in the rect
    apply(w, { type: 'talk', key: 'duck' }, content)
    expect(w.dialogue?.node).toBe('line')
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('hold')
    apply(w, { type: 'tick', dt: 500 }, content)
    apply(w, { type: 'interact' }, content) // nothing to skip: the scene waits on him
    apply(w, { type: 'menu' }, content)
    expect([w.dialogue?.node, w.menu]).toEqual(['hold', null])

    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 250 }, content) // one tile, and 2,1 is outside
    expect([w.player.x, w.player.y, w.dialogue?.node]).toEqual([2, 1, 'end'])
    apply(w, { type: 'move', dir: null }, content)
  })

  it('is not said at all to somebody already clear of it', () => {
    const w = room(['####', '####', '####', '####'])
    apply(w, { type: 'talk', key: 'duck' }, content) // stood in the far corner
    expect(w.dialogue?.node).toBe('end')
  })
})

describe('the blast', () => {
  it('crusts the sea seven out and joins the whole disc to home, not just the near side', () => {
    const w = createWorld()
    blast(w, 14, 18)
    for (const [x, y] of [
      [12, 12],
      [12, 24],
      [9, 18],
      [7, 18],
    ])
      expect([w.tiles[y * w.width + x], w.main[y * w.width + x]]).toEqual(['salt', true])
    expect(w.tiles[18 * w.width + 6]).toBe('water') // eight out is outside the circle
  })
})

describe('a box closing', () => {
  it('fires done:<key>, and a line already queued still gets its turn', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'first' }, content)
    w.queue.push({ key: 'boom' }) // something the sim started while the first box was up
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('after') // the trigger cuts in ahead of the queue
    expect(w.queue).toEqual([{ key: 'boom' }, { key: 'hush' }]) // and hush answers it too

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('boom')
  })

  it('leaves a trigger with an `unless` flag alone once that flag is set, unfired', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'first' }, content)
    apply(w, { type: 'interact' }, content)
    expect([w.dialogue?.key, w.queue]).toEqual(['after', [{ key: 'hush' }]]) // both play, in order

    const quiet = createWorld()
    quiet.flags.quiet = true
    apply(quiet, { type: 'talk', key: 'first' }, content)
    apply(quiet, { type: 'interact' }, content)
    expect([quiet.dialogue?.key, quiet.queue, quiet.flags['fired:hush']]).toEqual([
      'after',
      [],
      undefined,
    ])
  })
})
