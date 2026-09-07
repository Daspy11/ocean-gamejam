import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, type Content, type Obj, type World } from './world'

// only the boxes the generator opens; the real lines live in assets/dialogue
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    firstsalt: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'salt:spawn' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER first salt]', next: null } },
    },
    insalting: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'salt:place', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER insalting]', next: null } },
    },
    away: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'salt:away', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER salt laid out at sea]', next: null } },
    },
    negative: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'score:negative', when: 'score:on' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER beauty below zero]', next: null } },
    },
  },
  items: { salt: { name: '[PLACEHOLDER salt]' }, orb: { name: '[PLACEHOLDER orb]' } },
}

// east beach at 20,16 facing the open water at 21,16, the orb picked up off the sand and in hand
function shore(): World {
  const w = createWorld()
  w.player.x = 20
  w.player.y = 16
  w.player.facing = 'right'
  w.objects.splice(
    w.objects.findIndex((o) => o.id === 'orb1'),
    1,
  )
  w.inventory.orb = 1
  w.flags['had:orb'] = true
  return w
}

// the big island's west beach at 32,16, facing the open sea at 31,16 with a salt in hand and
// beauty already showing: nothing laid out here is anywhere near the island the player lives on
function away(): World {
  const w = createWorld()
  w.player = { ...w.player, x: 32, y: 16, facing: 'left' }
  w.inventory.salt = 1
  w.score = 10
  w.flags['score:on'] = true
  return w
}

// the same, from the small east island's north shore at 25,14, facing the water at 25,13
function eastIsland(): World {
  const w = away()
  w.player = { ...w.player, x: 25, y: 14, facing: 'up' }
  return w
}

const orbAt = (w: World): Extract<Obj, { kind: 'orb' }> | undefined =>
  w.objects.find((o) => o.kind === 'orb') as Extract<Obj, { kind: 'orb' }> | undefined

describe('throwing the orb in the sea', () => {
  it('leaves it on the water tile it was thrown at, boiling', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    const orb = orbAt(w)
    expect([orb?.x, orb?.y]).toEqual([21, 16])
    expect(orb?.doneAt).toBe(w.time + 2000)
    expect(w.inventory.orb).toBe(0)
    expect(tileAt(w, 21, 16)).toBe('water') // it boils the tile, it does not fill it in yet
  })

  it('records the tile it was thrown from, and again on the throw after that', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    expect(orbAt(w)?.thrown).toEqual({ x: 20, y: 16, at: 0 })

    apply(w, { type: 'interact' }, content) // pick it straight back up
    apply(w, { type: 'tick', dt: 500 }, content)
    apply(w, { type: 'interact' }, content) // and throw it again, half a second on
    expect(orbAt(w)?.thrown).toEqual({ x: 20, y: 16, at: 500 })
  })

  it('comes straight back to the inventory before it has boiled', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    expect(orbAt(w)).toBeUndefined()
    expect(w.inventory.orb).toBe(1)
    expect(w.dialogue).toBe(null) // the crate already showed the got box for the orb
  })
})

describe('the salt generator', () => {
  it('boils the tile into salt after 2 s and plays the triggered line once', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 1999 }, content)
    expect(tileAt(w, 21, 16)).toBe('water')

    const before = w.rev
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.rev).toBeGreaterThan(before)
    expect(w.dialogue?.key).toBe('firstsalt')
    expect(w.flags['fired:firstsalt']).toBe(true)
  })

  it('leaves the orb sitting on its finished salt, ready to be picked up again', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    expect(orbAt(w)?.x).toBe(21)

    apply(w, { type: 'interact' }, content)
    expect(orbAt(w)).toBeUndefined()
    expect(w.inventory.orb).toBe(1)
    expect(tileAt(w, 21, 16)).toBe('salt') // taking the orb does not take the crust with it
  })

  it('does not replay the triggered line the second time round', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    apply(w, { type: 'interact' }, content) // take the orb back

    w.player.y = 15 // the water tile north-east of the beach, an untouched patch of sea
    w.player.facing = 'right'
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(tileAt(w, 21, 15)).toBe('salt')
    expect(w.dialogue).toBe(null)
  })
})

describe('the crust the orb leaves', () => {
  it('stays where it was laid: a bare salt tile cannot be picked back up', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    apply(w, { type: 'interact' }, content) // take the orb off the salt

    apply(w, { type: 'interact' }, content)
    expect([tileAt(w, 21, 16), w.inventory.salt]).toEqual(['salt', undefined])
    expect([w.dialogue, w.flags['had:salt']]).toEqual([null, undefined])
  })

  it('feeds the salt straight back into growing the island', () => {
    const w = shore()
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content) // salt in hand wins, so the orb stays in the bag
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.inventory).toEqual({ orb: 1, salt: 0 })
  })
})

describe('paving the sea over once beauty is on', () => {
  it('costs a beauty silently before the score is a thing', () => {
    const w = shore()
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content)
    expect([w.score, w.pops.length, w.dialogue]).toEqual([-1, 0, null])
  })

  it('costs a beauty per tile, with Mich complaining the first time only', () => {
    const w = shore()
    w.inventory.salt = 2
    w.score = 10
    w.flags['score:on'] = true

    apply(w, { type: 'interact' }, content)
    expect([tileAt(w, 21, 16), w.score]).toEqual(['salt', 9])
    expect(w.pops).toEqual([{ x: 21, y: 16, text: '-1', at: w.time }])
    expect(w.dialogue?.key).toBe('insalting')
    expect(w.flags['fired:insalting']).toBe(true)

    apply(w, { type: 'interact' }, content) // dismiss the complaint
    w.player.y = 15 // another patch of sea
    apply(w, { type: 'interact' }, content)
    expect([tileAt(w, 21, 15), w.score, w.pops.length]).toEqual(['salt', 8, 2])
    expect(w.dialogue).toBe(null) // she only says it once
  })
})

describe('beauty counts salt on the main island', () => {
  it('costs one to boil a tile, with no pop until beauty is on', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect([w.score, w.pops.length]).toEqual([-1, 0])
  })

  it('pops the -1 over the boiled tile once beauty is on', () => {
    const w = shore()
    w.score = 10
    w.flags['score:on'] = true
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(w.score).toBe(9)
    expect(w.pops).toEqual([{ x: 21, y: 16, text: '-1', at: 2000 }])
  })

  it('never gives it back, since the crust cannot be dug up again', () => {
    const w = shore()
    w.score = 10
    w.flags['score:on'] = true
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    apply(w, { type: 'interact' }, content) // take the orb off the salt

    apply(w, { type: 'interact' }, content)
    expect([w.score, w.pops.length]).toEqual([9, 1]) // still just the -1 for boiling it
    expect(w.main[16 * w.width + 21]).toBe(true) // and the island keeps the tile
  })

  it('charges nothing for a tile boiled out of reach of the island', () => {
    const w = away() // 32,16 on the big island's beach, facing the sea at 31,16
    w.inventory.orb = 1
    w.flags['had:orb'] = true
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(tileAt(w, 31, 16)).toBe('salt')
    expect([w.score, w.pops.length]).toEqual([10, 0])
  })

  it('leaves a crust out at sea alone too, salt in hand and all', () => {
    const w = away()
    w.tiles[16 * w.width + 31] = 'salt'
    apply(w, { type: 'interact' }, content)
    expect([w.score, w.pops.length]).toEqual([10, 0])
    expect(w.inventory.salt).toBe(1) // the one carried out here, and nowhere to put it
  })
})

describe('the main island', () => {
  const main = (w: World, x: number, y: number) => w.main[y * w.width + x]

  it('is the island the player washed up on, and no other', () => {
    const w = createWorld()
    expect([main(w, 14, 16), main(w, 16, 16)]).toEqual([true, true])
    expect(main(w, 24, 16)).toBe(false) // the small east island
    expect(main(w, 22, 3)).toBe(false) // the empty one up north
    expect(main(w, 45, 20)).toBe(false) // the big one out east
    expect(main(w, 21, 16)).toBe(false) // open water
  })

  it('grows through every block the player lays, at a beauty each', () => {
    const w = shore()
    w.inventory.salt = 2
    w.score = 10
    w.flags['score:on'] = true

    apply(w, { type: 'interact' }, content)
    expect([main(w, 21, 16), w.score]).toEqual([true, 9])
    expect(w.dialogue?.key).toBe('insalting')
    apply(w, { type: 'interact' }, content) // dismiss the complaint

    w.player.x = 21 // out onto the block just laid, and lay the next one from there
    apply(w, { type: 'interact' }, content)
    expect([main(w, 22, 16), w.score]).toEqual([true, 8])
  })

  it('never reaches a block laid out at sea, which is free and silent', () => {
    for (const w of [away(), eastIsland()]) {
      const [x, y] = w.player.facing === 'left' ? [31, 16] : [25, 13]
      apply(w, { type: 'interact' }, content)
      expect([tileAt(w, x, y), main(w, x, y)]).toEqual(['salt', false])
      expect([w.score, w.pops.length]).toEqual([10, 0])
      expect(w.dialogue?.key).toBe('away') // Walter's line, not Mich's
      expect(w.flags['fired:insalting']).toBeUndefined()
    }
  })

  it('is where a flower has to bloom to be worth its 10', () => {
    const w = createWorld()
    w.flags['score:on'] = true
    w.objects.push({ id: 'far', kind: 'flower', x: 45, y: 20, bloomAt: 0 })
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect([w.score, w.pops.length]).toEqual([0, 0])

    w.objects.push({ id: 'home', kind: 'flower', x: 16, y: 15, bloomAt: w.time })
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect(w.score).toBe(10)
    expect(w.pops.at(-1)).toEqual({ x: 16, y: 15, text: '+10', at: 3000 })
  })
})

describe('beauty going negative', () => {
  it('plays the line once, on the tick after the score drops below zero', () => {
    const w = shore()
    w.inventory.salt = 1
    w.flags['score:on'] = true
    apply(w, { type: 'interact' }, content) // paves a tile: beauty goes to -1
    expect([w.score, w.dialogue?.key]).toEqual([-1, 'insalting'])

    apply(w, { type: 'tick', dt: 1 }, content) // queues up behind Mich's complaint
    expect(w.flags['fired:negative']).toBe(true)
    apply(w, { type: 'interact' }, content) // dismiss the complaint, and the queue comes in
    expect(w.dialogue?.key).toBe('negative')

    apply(w, { type: 'interact' }, content) // dismiss it too
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.dialogue).toBe(null) // still negative, but she only says it once
  })

  it('waits for beauty to be introduced before saying anything', () => {
    const w = shore()
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 1 }, content)
    expect([w.score, w.dialogue]).toEqual([-1, null])

    w.flags['score:on'] = true
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.dialogue?.key).toBe('negative')
  })
})
