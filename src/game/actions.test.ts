import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, type Content, type Dir, type World } from './world'

// dialogue content lives in dialogue.test.ts; nothing here needs a line of it
const content: Content = {
  dialogues: {},
  items: { salt: { name: '[PLACEHOLDER salt]' }, orb: { name: '[PLACEHOLDER orb]' } },
}

function at(x: number, y: number, facing: Dir = 'down'): World {
  const w = createWorld()
  w.player.x = x
  w.player.y = y
  w.player.facing = facing
  return w
}

describe('walking', () => {
  it('takes 250 ms per tile and keeps going while the key is held', () => {
    const w = createWorld() // 14,16 facing right
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y]).toEqual([15, 16])
    expect(w.player.step).toEqual({ x: 16, y: 16, t: 0 }) // held: the next step starts at once

    apply(w, { type: 'move', dir: null }, content) // release
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y]).toEqual([16, 16])
    expect(w.player.step).toBe(null)
  })

  it('holds a constant speed across tile boundaries', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right' }, content)
    const before = w.rev
    for (let i = 0; i < 6; i++) apply(w, { type: 'tick', dt: 100 }, content) // 600 ms = 2.4 tiles
    expect(w.player.x).toBe(16)
    expect(w.player.step?.t).toBeCloseTo(0.4)
    expect(w.rev).toBe(before + 5) // 3 steps started + 2 arrivals; progress itself bumps nothing
  })

  it('runs at 125 ms per tile', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right', run: true }, content)
    apply(w, { type: 'tick', dt: 125 }, content)
    expect([w.player.x, w.player.y]).toEqual([15, 16])
  })

  it('applies a direction change at the next tile boundary', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 125 }, content)
    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.player.facing).toBe('right') // mid-step, so the turn waits

    apply(w, { type: 'tick', dt: 125 }, content)
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([15, 16, 'down'])
    expect(w.player.step).toEqual({ x: 15, y: 17, t: 0 }) // no turn delay while already walking
  })
})

describe('turning', () => {
  it('turns in place on a tap without walking', () => {
    const w = createWorld()
    const before = w.rev
    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.player.facing).toBe('down')
    expect(w.player.step).toBe(null)
    expect(w.rev).toBe(before + 1)

    apply(w, { type: 'tick', dt: 50 }, content)
    apply(w, { type: 'move', dir: null }, content) // released inside the turn delay
    apply(w, { type: 'tick', dt: 200 }, content)
    expect([w.player.x, w.player.y, w.player.step]).toEqual([14, 16, null])
  })

  it('walks once the key has been held for the turn delay', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'tick', dt: 99 }, content)
    expect(w.player.step).toBe(null)

    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.player.step?.x).toBe(14)
    expect(w.player.step?.y).toBe(17)
  })
})

describe('blocked', () => {
  it('does not walk into water', () => {
    const w = at(14, 18, 'left') // the south-west sand edge; 13,18 is open sea
    apply(w, { type: 'move', dir: 'left' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y, w.player.facing, w.player.step]).toEqual([14, 18, 'left', null])
  })

  it('does not walk into solid objects', () => {
    const cases = [
      [16, 14, 'left'], // tree1 at 15,14
      [14, 15, 'left'], // mich at 13,15
      [16, 18, 'right'], // hut1 covers 17..18 x 17..18
      [18, 16, 'down'],
      [14, 16, 'left'], // the wrecked boat covers 12..13 x 16, right where the player spawns
      [14, 17, 'left'], // crate1 at 13,17
    ] as const
    for (const [x, y, dir] of cases) {
      const w = at(x, y)
      apply(w, { type: 'move', dir }, content)
      apply(w, { type: 'tick', dt: 300 }, content)
      expect([w.player.x, w.player.y, w.player.step]).toEqual([x, y, null])
    }
  })
})

describe('interact', () => {
  it('is ignored while stepping', () => {
    const w = at(16, 15)
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 100 }, content) // stepping toward 17,15
    expect(w.player.step?.x).toBe(17)

    const before = w.rev
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
    expect(w.rev).toBe(before)
    expect(w.player.step?.x).toBe(17)
  })
})

describe('the crate', () => {
  it('hands over the orb once and then stays open and empty', () => {
    const w = at(14, 17, 'left') // crate1 at 13,17
    apply(w, { type: 'interact' }, content)
    const crate = w.objects.find((o) => o.id === 'crate1')
    expect(crate?.kind === 'crate' && crate.open).toBe(true)
    expect(w.inventory.orb).toBe(1)

    const before = w.rev
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.orb).toBe(1)
    expect(w.rev).toBe(before)
  })

  it('gives the orb the first inventory slot however late it is found', () => {
    const w = at(14, 17, 'left') // crate1 at 13,17
    w.inventory = { salt: 2, twig: 1 }
    apply(w, { type: 'interact' }, content)
    expect(Object.keys(w.inventory)).toEqual(['orb', 'salt', 'twig'])
    expect(w.inventory).toEqual({ orb: 1, salt: 2, twig: 1 })
  })

  it('leaves the slot order alone once the orb has been had', () => {
    const w = at(14, 17, 'left')
    w.inventory = { salt: 2, twig: 1 }
    w.flags['had:orb'] = true
    apply(w, { type: 'interact' }, content)
    expect(Object.keys(w.inventory)).toEqual(['salt', 'twig', 'orb'])
  })
})

describe('placing salt', () => {
  it('turns the faced water tile into salt and spends a salt', () => {
    const w = at(20, 16, 'right') // the east beach, facing the gap
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content)
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.inventory.salt).toBe(0)
  })

  it('makes the new tile walkable', () => {
    const w = at(20, 16, 'right')
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y]).toEqual([21, 16])
  })

  it('does nothing with empty hands', () => {
    const w = at(20, 16, 'right')
    const before = w.rev
    apply(w, { type: 'interact' }, content)
    expect(tileAt(w, 21, 16)).toBe('water')
    expect(w.rev).toBe(before)
  })

  it('spends the salt before the orb when carrying both', () => {
    const w = at(20, 16, 'right')
    w.inventory = { salt: 1, orb: 1 }
    apply(w, { type: 'interact' }, content)
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.inventory).toEqual({ salt: 0, orb: 1 })
    expect(w.objects.some((o) => o.kind === 'orb')).toBe(false)
  })
})

// the second island sits two water tiles east of the beach at 20,16
describe('bridging the gap', () => {
  it('crosses to the second island on two salt', () => {
    const w = at(20, 16, 'right')
    w.inventory.salt = 2
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 250 }, content) // onto 21,16; the water beyond stops the next step
    expect([w.player.x, w.player.step]).toEqual([21, null])

    apply(w, { type: 'interact' }, content)
    expect([tileAt(w, 21, 16), tileAt(w, 22, 16)]).toEqual(['salt', 'salt'])
    apply(w, { type: 'tick', dt: 250 }, content) // still held: 21 -> 22
    apply(w, { type: 'move', dir: null }, content)
    apply(w, { type: 'tick', dt: 250 }, content) // 22 -> 23, the second island
    expect([w.player.x, w.player.y, w.inventory.salt]).toEqual([23, 16, 0])
  })

  it('leaves the player stranded one tile short on a single salt', () => {
    const w = at(20, 16, 'right')
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    for (let i = 0; i < 8; i++) apply(w, { type: 'tick', dt: 250 }, content)
    expect([w.player.x, w.player.y]).toEqual([21, 16])
    expect(tileAt(w, 22, 16)).toBe('water')
  })
})

describe('menu', () => {
  it('toggles the inventory screen', () => {
    const w = createWorld()
    apply(w, { type: 'menu' }, content)
    expect(w.menu).toEqual({ screen: 'inventory', cursor: 0 })

    apply(w, { type: 'menu' }, content)
    expect(w.menu).toBe(null)
  })

  // being ignored during a dialogue is covered in dialogue.test.ts
  it('is ignored while stepping', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.player.step).not.toBe(null)
    apply(w, { type: 'menu' }, content)
    expect(w.menu).toBe(null)
  })

  it('moves the cursor over filled slots only and does not walk', () => {
    const w = createWorld()
    w.inventory.salt = 3 // one entry, so every direction clamps to 0
    apply(w, { type: 'menu' }, content)

    const before = w.rev
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.menu?.cursor).toBe(0)
    expect(w.rev).toBe(before)

    apply(w, { type: 'tick', dt: 300 }, content) // held 'down' must not walk
    expect([w.player.x, w.player.y, w.player.step]).toEqual([14, 16, null])

    apply(w, { type: 'interact' }, content)
    expect(w.rev).toBe(before)
  })
})

describe('score pops', () => {
  it('floats for 1500 ms and then disappears with a rev bump', () => {
    const w = createWorld()
    w.pops.push({ x: 16, y: 16, text: '+10', at: 0 })

    const idle = w.rev
    apply(w, { type: 'tick', dt: 1499 }, content)
    expect(w.pops.length).toBe(1)
    expect(w.rev).toBe(idle)

    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.pops).toEqual([])
    expect(w.rev).toBe(idle + 1)

    apply(w, { type: 'tick', dt: 1500 }, content) // nothing left to drop
    expect(w.rev).toBe(idle + 1)
  })
})

describe('rev', () => {
  it('moves only on a visible change', () => {
    const w = createWorld()
    const idle = w.rev
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.rev).toBe(idle)

    apply(w, { type: 'move', dir: 'down' }, content) // turn
    expect(w.rev).toBe(idle + 1)

    apply(w, { type: 'tick', dt: 100 }, content) // starts the step
    const walking = w.rev
    apply(w, { type: 'tick', dt: 100 }, content) // progress only
    expect(w.rev).toBe(walking)
    expect(w.player.step?.t).toBeCloseTo(0.8)
  })
})
