import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, objectAt, tileAt, type Content, type World } from './world'

// the shape of assets/dialogue/seahorse.json: he swims up, shows off the desalinator, and it goes off
const content: Content = {
  dialogues: {
    seahorse: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'score:fifteen' },
      start: [{ node: '1' }],
      nodes: {
        '1': {
          spawn: {
            id: 'seahorse',
            kind: 'npc',
            sprite: 'seahorse',
            x: 16,
            y: 23,
            facing: 'up',
            dialogue: 'seahorse',
          },
          next: '2',
        },
        '2': { walk: { id: 'seahorse', path: ['up', 'up'] }, next: '3' },
        '3': { text: '[PLACEHOLDER he is impressed]', next: '4' },
        '4': {
          put: {
            by: 'seahorse',
            obj: { id: 'desalinator', kind: 'machine', x: 0, y: 0, left: 10 },
          },
          next: '5',
        },
        '5': { text: '[PLACEHOLDER he shows it off]', next: '6' },
        '6': { gone: 'desalinator', next: '7' },
        '7': { text: '[PLACEHOLDER it went off]', next: null },
      },
    },
  },
  items: {},
}

// fifteen beauty, then the ticks that bring him up the two tiles onto the spit and open his first line
function arrived(): World {
  const w = createWorld()
  w.score = 15
  for (let n = 0; n < 4; n++) apply(w, { type: 'tick', dt: 250 }, content)
  return w
}

describe('the sea horse', () => {
  it('comes up out of the sea the first time beauty reads 15', () => {
    const w = createWorld()
    w.score = 15
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.flags['fired:seahorse']).toBe(true)
    expect(w.dialogue?.key).toBe('seahorse')
    const him = () => w.objects.find((o) => o.id === 'seahorse')
    expect([him()?.x, him()?.y]).toEqual([16, 23]) // out in the water off the southern spit

    for (let n = 0; n < 4; n++) apply(w, { type: 'tick', dt: 250 }, content)
    expect([him()?.y, w.dialogue?.node]).toEqual([21, '3']) // ashore, and talking
  })

  it('only ever turns up once, however far beauty swings after it', () => {
    const w = arrived()
    w.dialogue = null
    w.score = 40
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.dialogue).toBeNull()
    expect(w.objects.filter((o) => o.id === 'seahorse').length).toBe(1)
  })
})

describe('the desalinator 9000', () => {
  it('goes down on the nearest ground beside him, the sea to his left being no use', () => {
    const w = arrived()
    apply(w, { type: 'interact' }, content) // past his line, onto the act that puts it down
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(objectAt(w, 16, 20)?.id).toBe('desalinator') // 15,21 is his left, and it is water
    expect(w.dialogue?.node).toBe('5')
  })

  it('drains a beauty every two seconds, then blows up and salts the sea around it', () => {
    const w = arrived()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    apply(w, { type: 'interact' }, content) // the box holds on the act until it has gone off
    expect(w.dialogue?.node).toBe('6')

    apply(w, { type: 'tick', dt: 2000 }, content)
    expect([w.score, w.dialogue?.node]).toEqual([14, '6'])
    for (let n = 0; n < 9; n++) apply(w, { type: 'tick', dt: 2000 }, content)

    expect(w.objects.some((o) => o.kind === 'machine')).toBe(false)
    expect(w.dialogue?.node).toBe('7') // the act is over the moment the thing is gone
    expect(tileAt(w, 16, 23)).toBe('salt') // three tiles every way from 16,20
    expect(tileAt(w, 13, 20)).toBe('salt')
    expect(tileAt(w, 16, 24)).toBe('water') // and not a tile further
    expect(w.score).toBeLessThan(0) // ten cycles, plus a beauty for every tile of new crust
    expect(w.rumble).toBeGreaterThan(w.time)
  })
})
