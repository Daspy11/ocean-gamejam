import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { blast } from './machine'
import { findPath } from './path'
import { createWorld, npc, objectAt, type Content, type Obj, type World } from './world'

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
        walk: { walk: { id: 'a', to: { x: 4, y: 0 }, push: 'cannon' }, next: 'end' },
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
    build: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'wall' }],
      nodes: {
        wall: { wall: { id: 'seahorse', y: 1, from: 0, to: 4 }, next: 'end' },
        end: { text: '[PLACEHOLDER build 1]', next: null },
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
  it('keeps it a tile ahead the whole way and leaves it where the walk ends', () => {
    const w = room(
      ['######', '######'],
      [npc('a', 'mich', 0, 1, 'right', 'mich'), { id: 'cannon', kind: 'cannon', x: 1, y: 1 }],
    )
    apply(w, { type: 'talk', key: 'shove' }, content)
    expect(at(w, 'a').push).toEqual({ id: 'cannon', dx: 1, dy: 0 })

    for (let n = 0; n < 12; n++) {
      apply(w, { type: 'tick', dt: 125 }, content)
      const [me, it] = [at(w, 'a'), at(w, 'cannon')]
      expect([it.x - me.x, it.y - me.y]).toEqual([1, 0]) // rigidly one tile ahead, mid-step and all
      if (me.step) expect(it.step).toEqual({ x: me.step.x + 1, y: me.step.y, t: me.step.t })
    }
    expect([at(w, 'a').x, at(w, 'a').y]).toEqual([4, 0])
    expect([at(w, 'cannon').x, at(w, 'cannon').y]).toEqual([5, 0]) // left standing where he stopped
    expect(at(w, 'cannon').step).toBe(null)
    expect(at(w, 'a').push).toBeUndefined()
    expect(w.dialogue?.node).toBe('end') // the walk act moved the scene on
  })

  it('is never a wall to the one pushing it', () => {
    const me = npc('a', 'mich', 0, 0, 'right', 'mich')
    const w = room(['####'], [me, { id: 'cannon', kind: 'cannon', x: 1, y: 0 }])
    expect(findPath(w, me, { x: 2, y: 0 })).toBe(null) // solid, and no way round it in a corridor
    me.push = { id: 'cannon', dx: 1, dy: 0 }
    expect(findPath(w, me, { x: 2, y: 0 })).toEqual(['right', 'right'])
  })
})

// two rows of grass off a sandy point, the cannon on the sand and things standing about on the grass
function island(cannonY = 0): World {
  return room(
    ['.#####', '.#####'],
    [
      { id: 'cannon', kind: 'cannon', x: 0, y: cannonY },
      { id: 'crate1', kind: 'crate', x: 2, y: 0, open: false, item: 'orb' },
      { id: 'tree1', kind: 'tree', x: 4, y: 1 },
      { id: 'orb1', kind: 'orb', x: 5, y: 0, doneAt: 0 },
      npc('mich', 'mich', 1, 1, 'down', 'mich'),
    ],
  )
}

describe('the cannon', () => {
  it('spreads one shot per tile over 4 s, with a ball out of the muzzle every 20 ms for show', () => {
    const w = island()
    apply(w, { type: 'talk', key: 'boom' }, content)
    const f = at(w, 'cannon').kind === 'cannon' ? at(w, 'cannon') : null
    expect(f?.kind === 'cannon' && f.firing).toMatchObject({ every: 400, nextAt: 0 }) // 10 tiles
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([charred(w), w.score]).toEqual([1, -3]) // the one shot so far has told; 400 is next
    expect(w.pops.at(-1)).toMatchObject({ text: '-3' })
    const flying = w.objects.filter((o) => o.kind === 'ball')
    expect(flying.length).toBe(13) // 0, 20 .. 240
    expect(flying[0]).toMatchObject({ id: 'ball0', x: 0, y: 0, at: 0 }) // every one from the muzzle
    for (const b of flying) if (b.kind === 'ball') expect(Math.abs(b.dir)).toBeLessThanOrEqual(85)
    expect(new Set(flying.map((b) => b.kind === 'ball' && b.dir)).size).toBeGreaterThan(1) // sprayed

    apply(w, { type: 'tick', dt: 1250 }, content)
    expect(w.objects.some((o) => o.id === 'ball0')).toBe(false) // 1500 ms: off the map and gone
    expect(w.objects.filter((o) => o.kind === 'ball').length).toBe(75) // 20 .. 1500 still up
  })

  it('chars every grass tile, wrecks what stood there, spares the cast, and moves the scene on', () => {
    const w = island()
    apply(w, { type: 'talk', key: 'boom' }, content)
    for (let n = 0; n < 100 && w.dialogue?.node === 'fire'; n++)
      apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.time).toBeLessThanOrEqual(4000) // the last of ten shots goes at 3600
    expect(w.dialogue?.node).toBe('end') // over with the last shot, balls or no balls
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect(has(w, 'ball')).toBe(false)
    expect([has(w, 'crate'), has(w, 'tree')]).toEqual([false, false])
    expect([has(w, 'npc'), has(w, 'cannon'), has(w, 'orb')]).toEqual([true, true, true])
    expect([charred(w), w.score]).toEqual([10, -30]) // 3 a tile, and the sand is left alone
    expect(w.tiles[0]).toBe('sand')
  })

  it('only ever fires down the island, never back over its own row', () => {
    const w = island(1)
    apply(w, { type: 'talk', key: 'boom' }, content)
    for (let n = 0; n < 100 && w.dialogue?.node === 'fire'; n++)
      apply(w, { type: 'tick', dt: 100 }, content)
    expect([charred(w), w.score, has(w, 'crate'), has(w, 'tree')]).toEqual([5, -15, true, false])
  })

  it('shoots the tiles in the same order from the same seed', () => {
    const order = () => {
      const w = island()
      apply(w, { type: 'talk', key: 'boom' }, content)
      const c = at(w, 'cannon')
      return c.kind === 'cannon' ? [...c.firing!.work] : []
    }
    expect(order().length).toBe(10)
    expect(order()).toEqual(order())
    expect(order()).not.toEqual([...order()].sort((a, b) => a - b)) // shuffled, not in reading order
  })
})

describe("the sea horse's wall", () => {
  it('goes up a block at a time along the row above him as he walks, at 10 beauty each', () => {
    const w = room(
      ['~~~~~', 'sssss', 'sssss'],
      [npc('seahorse', 'seahorse', 0, 2, 'up', 'seahorse')],
    )
    apply(w, { type: 'talk', key: 'build' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(objectAt(w, 0, 1)).toMatchObject({ kind: 'cinder' }) // the first, where he stood
    expect(w.score).toBe(-10)
    for (let n = 0; n < 8 && w.dialogue?.node === 'wall'; n++)
      apply(w, { type: 'tick', dt: 250 }, content)
    expect(w.objects.filter((o) => o.kind === 'cinder').map((o) => [o.x, o.y])).toEqual(
      [0, 1, 2, 3, 4].map((x) => [x, 1]),
    )
    expect([at(w, 'seahorse').x, at(w, 'seahorse').y, w.score]).toEqual([4, 2, -50])
    expect(w.dialogue?.node).toBe('end')
  })

  it('is over at once when he is not stood at its start', () => {
    const w = room(
      ['~~~~~', 'sssss', 'sssss'],
      [npc('seahorse', 'seahorse', 2, 2, 'up', 'seahorse')],
    )
    apply(w, { type: 'talk', key: 'build' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect([has(w, 'cinder'), w.dialogue?.node]).toEqual([false, 'end'])
  })
})

describe('the blast', () => {
  it('crusts the sea seven out and joins the whole disc to home, not just the near side', () => {
    const w = createWorld()
    blast(w, 16, 20)
    for (const [x, y] of [
      [10, 23],
      [22, 23],
      [16, 25],
      [16, 27],
    ])
      expect([w.tiles[y * w.width + x], w.main[y * w.width + x]]).toEqual(['salt', true])
    expect(w.tiles[28 * w.width + 16]).toBe('water') // eight down is outside the circle
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
