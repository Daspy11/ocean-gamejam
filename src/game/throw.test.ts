import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, npc, type Content, type Obj, type World } from './world'

// the shape of the end of assets/dialogue/tarq.json: pick a thing, fetch it, throw it at him
const content: Content = {
  dialogues: {
    egg: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'throw' }],
      nodes: {
        throw: { throw: { kind: 'egg', at: 'tarq' }, next: 'end' },
        end: { text: '[PLACEHOLDER ow]', next: null },
      },
    },
    board: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'walk' }],
      nodes: {
        walk: { walk: { id: 'player', to: { x: 16, y: 14 } }, next: 'on' },
        on: { ride: { id: 'player', on: 'flyingcarpet1' }, next: 'off' },
        off: { walk: { id: 'flyingcarpet1', path: ['right'] }, next: 'end' },
        end: { text: '[PLACEHOLDER aboard]', next: null },
      },
    },
    rug: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'throw' }],
      nodes: {
        throw: { throw: { kind: 'floor', at: 'tarq' }, next: 'end' },
        end: { text: '[PLACEHOLDER it bounces off]', next: null },
      },
    },
  },
  items: {},
}

// Tarq up on his carpet out east, and something to throw at him on the grass by the player
function scene(thing: Obj): World {
  const w = createWorld()
  w.flags['score:on'] = true
  w.objects.push({ id: 'flyingcarpet1', kind: 'flyingcarpet', x: 20, y: 15 })
  w.objects.push(
    Object.assign(npc('tarq', 'tarq', 20, 15, 'left', 'tarq'), { ride: 'flyingcarpet1' }),
  )
  w.objects.push(thing)
  return w
}
const at = (w: World, id: string) => w.objects.find((o) => o.id === id)
// the walk, the flight and the carpet's 3 s trip down, a tick at a time
const run = (w: World, ms: number) => {
  for (let n = 0; n < ms / 50; n++) apply(w, { type: 'tick', dt: 50 }, content)
}

describe('the throw act', () => {
  it('walks him to the thing, throws it, and knocks Tarq off his carpet', () => {
    const w = scene({ id: 'egg16-17', kind: 'egg', x: 16, y: 17 })
    apply(w, { type: 'talk', key: 'egg' }, content)
    run(w, 3000)
    // he ends up beside it, and it is gone: thrown things are not picked back up
    expect(Math.abs(w.player.x - 16) + Math.abs(w.player.y - 17)).toBe(1)
    expect(at(w, 'egg16-17')).toBeUndefined()
    const him = at(w, 'tarq')
    expect(him?.kind === 'npc' && [him.ride, him.flat]).toEqual([undefined, true])
    // two tiles left of the carpet, from the tile he was hit on, which is the arc the scene draws
    expect([him?.x, him?.y, him?.thrown]).toEqual([18, 15, { x: 20, y: 15, at: him?.thrown?.at }])
    expect(w.dialogue?.node).toBe('throw') // the act holds while the carpet comes down

    for (let n = 0; n < 100 && w.dialogue?.node === 'throw'; n++)
      apply(w, { type: 'tick', dt: 50 }, content) // until it has settled, so the pop is still up
    const rug = at(w, 'flyingcarpet1')
    expect(rug?.kind === 'flyingcarpet' && rug.landAt).toBeLessThanOrEqual(w.time - 3000) // down
    expect(w.score).toBe(200)
    expect(w.pops.at(-1)).toMatchObject({ x: 20, y: 15, text: '+200' })
    expect(w.dialogue?.node).toBe('end')
  })

  it('leaves him on his carpet for anything that is not the egg', () => {
    const w = scene({ id: 'floor16-17', kind: 'floor', x: 16, y: 17 })
    apply(w, { type: 'talk', key: 'rug' }, content)
    run(w, 3000)
    expect(at(w, 'floor16-17')).toBeUndefined()
    const him = at(w, 'tarq')
    expect(him?.kind === 'npc' && [him.ride, him.flat]).toEqual(['flyingcarpet1', undefined])
    expect(w.score).toBe(0)
    expect(w.dialogue?.node).toBe('end')
  })

  it('is over at once when there is nothing of that kind on the island', () => {
    const w = scene({ id: 'sign9', kind: 'sign', x: 16, y: 17, dialogue: 'sign' })
    apply(w, { type: 'talk', key: 'egg' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect([w.throwing, w.dialogue?.node]).toEqual([null, 'end'])
  })

  it('walks the player where a cutscene sends him, and carries him once he is aboard', () => {
    const w = scene({ id: 'sign9', kind: 'sign', x: 16, y: 17, dialogue: 'sign' })
    apply(w, { type: 'talk', key: 'board' }, content)
    run(w, 1050)
    expect([w.player.x, w.player.y]).toEqual([16, 14]) // he walked himself there, no key held

    run(w, 1300)
    expect([w.player.x, w.player.y, w.player.ride]).toEqual([21, 15, 'flyingcarpet1'])
    expect(w.dialogue?.node).toBe('end') // and the carpet took him a tile east with it
  })
})
