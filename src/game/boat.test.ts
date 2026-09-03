import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type Obj, type World } from './world'

// the shape of assets/dialogue/boat.json: one line about the wreck, and no speaker name to draw
const content: Content = {
  dialogues: {
    boat: { name: '', start: [{ node: '1' }], nodes: { '1': { text: '[PLACEHOLDER boat 1]' } } },
  },
  items: {},
}

describe('examining the wreck', () => {
  it('opens the boat line from the spawn, looking back at the boat', () => {
    const w = createWorld() // 14,16, one tile inland of the wreck's dry half at 13,16
    w.player.facing = 'left'
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'boat', node: '1', choice: 0, item: undefined })
    expect(content.dialogues.boat.name).toBe('') // no one is speaking: the box draws no name

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })
})

// the pirate scene, in the shape of assets/dialogue/pirate.json: the screen shakes, a ship sails in
// from the east along row 8, hits the bridge, shakes the screen again, and the pirate steps off
const pirateContent: Content = {
  dialogues: {
    pirate: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'arrive:north' },
      start: [{ node: '1' }],
      nodes: {
        '1': { rumble: 800, next: '2' },
        '2': { spawn: { id: 'ship', kind: 'boat', x: 30, y: 8 }, next: '3' },
        '3': {
          spawn: {
            id: 'etarp',
            kind: 'npc',
            sprite: 'etarp',
            facing: 'left',
            dialogue: 'etarp',
            x: 30,
            y: 8,
            ride: 'ship',
          },
          next: '4',
        },
        '4': { walk: { id: 'ship', path: Array(30).fill('left'), run: true }, next: '5' },
        '5': { rumble: 500, next: '6' },
        '6': { text: '[PLACEHOLDER pirate 1]', next: '7' },
        '7': { walk: { id: 'etarp', path: ['left'] }, next: null },
      },
    },
    sail: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { walk: { id: 'ship', path: ['left', 'left', 'left'] }, next: null } },
    },
    etarp: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER etarp 1]', next: null } },
    },
  },
  items: {},
}

const obj = (w: World, id: string): Obj | undefined => w.objects.find((o) => o.id === id)
function ship(w: World) {
  const o = obj(w, 'ship')
  if (o?.kind !== 'boat') throw new Error('the ship is not a boat')
  return o
}
function etarp(w: World) {
  const o = obj(w, 'etarp')
  if (o?.kind !== 'npc') throw new Error('etarp is not an npc')
  return o
}
const tick = (w: World, n: number, dt = 250) => {
  for (let i = 0; i < n; i++) apply(w, { type: 'tick', dt }, pirateContent)
}

// the player one tile short of the north island, on the salt bridge he laid across row 8
function ashore(): World {
  const w = createWorld()
  for (let y = 6; y <= 12; y++) w.tiles[y * w.width + 20] = 'salt'
  w.player = { ...w.player, x: 20, y: 6, facing: 'up' }
  apply(w, { type: 'move', dir: 'up' }, pirateContent)
  apply(w, { type: 'tick', dt: 250 }, pirateContent) // one step: he is on the sand at 20,5
  return w
}

describe('the pirate arriving', () => {
  it('fires arrive:north as the player lands on the north island, and rumbles', () => {
    const w = ashore()
    expect([w.player.x, w.player.y]).toEqual([20, 5])
    expect(w.dialogue).toMatchObject({ key: 'pirate', node: '1' })
    expect(w.rumble).toBe(1050) // 800 ms from the 250 ms tick he arrived on
    expect(obj(w, 'ship')).toBeUndefined() // the ship waits for the shake to pass
  })

  it('never plays a second time, however often he walks back ashore', () => {
    const w = ashore()
    tick(w, 40)
    apply(w, { type: 'interact' }, pirateContent) // past the pirate's one line
    tick(w, 20)
    expect(w.dialogue).toBe(null)
    w.player = { ...w.player, x: 20, y: 6, facing: 'up' }
    apply(w, { type: 'move', dir: 'up' }, pirateContent)
    tick(w, 4)
    expect(w.dialogue).toBe(null)
  })

  it('sails the ship in with the pirate riding it, and wrecks it on the bridge', () => {
    const w = ashore()
    tick(w, 6, 200) // the 800 ms shake, then a tick each for the two spawns and the walk
    expect(obj(w, 'ship')).toMatchObject({ x: 30, y: 8 })
    expect(obj(w, 'etarp')).toMatchObject({ x: 30, y: 8, ride: 'ship' })

    tick(w, 4, 125) // running: 125 ms a tile
    expect(ship(w).x).toBe(26)
    expect(etarp(w)).toMatchObject({ x: 26, y: 8, step: ship(w).step })

    tick(w, 5, 125) // five more tiles west, and the sixth step is into the salt
    expect(ship(w)).toMatchObject({ x: 21, y: 8, wrecked: true, path: [] })
    expect(ship(w).step).toBe(null) // the tile east of the salt: it stopped dead there
    expect(w.dialogue?.node).toBe('5') // straight into the second shake
  })

  it('shakes again, says its line, and puts the pirate down on the salt', () => {
    const w = ashore()
    tick(w, 30, 125)
    expect(w.dialogue?.node).toBe('6')
    expect(obj(w, 'etarp')).toMatchObject({ x: 21, y: 8, ride: 'ship' })

    apply(w, { type: 'interact' }, pirateContent) // the line closes into the last walk
    expect(w.dialogue?.node).toBe('7')
    tick(w, 2)
    expect(etarp(w)).toMatchObject({ x: 20, y: 8, facing: 'left' })
    expect(etarp(w).ride).toBeUndefined() // he got out of the boat to walk
    expect(w.dialogue).toBe(null)
  })
})

describe('a boat under sail', () => {
  it('walks its whole path when nothing is in the way', () => {
    const w = createWorld()
    w.objects.push({ id: 'ship', kind: 'boat', x: 28, y: 8 })
    apply(w, { type: 'talk', key: 'sail' }, pirateContent)
    tick(w, 4)
    expect(ship(w)).toMatchObject({ x: 25, y: 8, path: [] })
    expect(ship(w).wrecked).toBeUndefined()
    expect(w.dialogue).toBe(null)
  })

  it('drops the ride when whatever was carrying it has gone', () => {
    const w = createWorld()
    w.objects.push({
      id: 'etarp',
      kind: 'npc',
      sprite: 'etarp',
      x: 20,
      y: 8,
      facing: 'left',
      dialogue: 'etarp',
      ride: 'ship',
    })
    tick(w, 1)
    expect(etarp(w).ride).toBeUndefined()
  })
})
