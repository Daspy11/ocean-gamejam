import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, type Content, type Dir, type World } from './world'

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

function at(x: number, y: number, facing: Dir, map: 'island' | 'cave' = 'island'): World {
  const w = createWorld(map)
  w.player = { ...w.player, x, y, facing }
  return w
}

describe('the cave', () => {
  it('keeps the interior off the ocean and preserves both areas across visits and save/load', () => {
    const w = at(42, 18, 'up')
    expect(tileAt(w, 7, 38)).toBe('water')
    expect(w.objects.some((o) => o.id === 'rum1' || o.id === 'caveout')).toBe(false)
    w.objects = w.objects.filter((o) => o.id !== 'gate1')
    w.flags['harry:asked'] = true
    w.inventory.twig = 7
    w.score = 3
    const outside = structuredClone({ tiles: w.tiles, objects: w.objects })
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect(w.area).toBe('cave')
    expect([w.width, w.height, w.left]).toEqual([22, 16, 0])
    expect(w.objects.map((o) => o.id)).toEqual(['caveout', 'rum1'])
    expect(w.main.some(Boolean)).toBe(false)
    expect(w.player.step).toBeNull()
    Object.assign(w.player, { x: 10, y: 6, facing: 'up', held: null })
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    const saved: World = JSON.parse(JSON.stringify(w))
    Object.assign(saved.player, { x: 10, y: 8, facing: 'down' })
    apply(saved, { type: 'move', dir: 'down' }, content)
    apply(saved, { type: 'tick', dt: 250 }, content)
    expect(saved.area).toBe('island')
    expect({ tiles: saved.tiles, objects: saved.objects }).toEqual(outside)
    expect(saved.inventory).toEqual({ twig: 7, rum: 1 })
    expect(saved.flags['harry:asked']).toBe(true)
    expect(saved.score).toBe(3)
    expect(saved.player).toMatchObject({ x: 42, y: 18, step: null })
    apply(saved, { type: 'move', dir: 'up' }, content)
    apply(saved, { type: 'tick', dt: 250 }, content)
    expect(saved.area).toBe('cave')
    expect(saved.objects.some((o) => o.id === 'rum1')).toBe(false)
  })

  it('puts the player down at the far end of the mouth he steps onto', () => {
    // standing on a forest tile is fine for a loaded world; only stepping into one is blocked
    const w = at(42, 18, 'up') // cave1 sits on the clear tile at 42,17
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([10, 8, 'up'])

    const back = at(10, 8, 'down', 'cave') // and caveout at 10,9 brings him back below the mouth
    apply(back, { type: 'move', dir: 'down' }, content)
    apply(back, { type: 'tick', dt: 217 }, content)
    expect([back.player.x, back.player.y, back.player.facing]).toEqual([42, 18, 'down'])
    expect(back.player.step).toBeNull() // a doorway ends the current step
  })
})

describe('the gate', () => {
  it('has a readable rum-stash sign beside its outside approach', () => {
    const w = at(42, 22, 'right')
    const sign = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/rum-sign.json', import.meta.url), 'utf8'),
    )
    const c = { ...content, dialogues: { ...content.dialogues, 'rum-sign': sign } }
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.key).toBe('rum-sign')
    expect(sign.nodes[w.dialogue!.node].text).toBe("etarp's VERY SECRET rum stash DO NOT TOUCH")
    apply(w, { type: 'interact' }, c)
    w.player.facing = 'up'
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.key).toBe('gate')
  })

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
    expect([w.player.x, w.player.y]).toEqual([10, 8]) // four tiles of corridor, then the mouth
  })
})

describe('the bottle of rum', () => {
  it('is carried off whole, and leaves an empty tile behind', () => {
    const w = at(10, 6, 'up', 'cave') // rum1 at 10,5, at the top of the cave room
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
