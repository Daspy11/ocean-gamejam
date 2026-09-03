import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, type Content, type Obj, type World } from './world'

// only the two boxes the generator opens; the real lines live in assets/dialogue
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
  },
  items: { salt: { name: '[PLACEHOLDER salt]' }, orb: { name: '[PLACEHOLDER orb]' } },
}

// east beach at 20,16 facing the open water at 21,16, orb in hand and the crate box already seen
function shore(): World {
  const w = createWorld()
  w.player.x = 20
  w.player.y = 16
  w.player.facing = 'right'
  w.inventory.orb = 1
  w.flags['had:orb'] = true
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

describe('digging up the boiled salt', () => {
  it('turns the crust back into water and hands over one salt, with the got box once', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    apply(w, { type: 'interact' }, content) // take the orb off the salt

    apply(w, { type: 'interact' }, content)
    expect(w.inventory.salt).toBe(1)
    expect(tileAt(w, 21, 16)).toBe('water')
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'salt' })
    expect(w.flags['had:salt']).toBe(true)

    apply(w, { type: 'interact' }, content) // dismiss the got box
    apply(w, { type: 'interact' }, content) // spend that salt on the tile the orb had boiled
    expect([tileAt(w, 21, 16), w.inventory.salt]).toEqual(['salt', 0])

    w.player.y = 15 // an untouched patch of sea, to run the whole loop a second time
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    apply(w, { type: 'interact' }, content) // take the orb
    apply(w, { type: 'interact' }, content) // and dig the second salt
    expect(w.inventory.salt).toBe(1)
    expect(w.dialogue).toBe(null) // no second got box
  })

  it('feeds the salt straight back into growing the island', () => {
    const w = shore()
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content) // salt in hand wins, so the orb stays in the bag
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.inventory).toEqual({ orb: 1, salt: 0 })
  })
})
