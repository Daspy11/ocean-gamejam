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
  it('leaves it floating on the water tile it was thrown at', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    const orb = orbAt(w)
    expect([orb?.x, orb?.y, orb?.salt]).toEqual([21, 16, false])
    expect(orb?.nextAt).toBe(w.time + 3000)
    expect(w.inventory.orb).toBe(0)
    expect(tileAt(w, 21, 16)).toBe('water') // the orb floats, it does not fill the tile in
  })

  it('comes back to the inventory when there is nothing on it', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    expect(orbAt(w)).toBeUndefined()
    expect(w.inventory.orb).toBe(1)
    expect(w.dialogue).toBe(null) // the crate already showed the got box for the orb
  })
})

describe('the salt generator', () => {
  it('boils out salt after 3 s and plays the triggered line once', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2999 }, content)
    expect(orbAt(w)?.salt).toBe(false)

    const before = w.rev
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(orbAt(w)?.salt).toBe(true)
    expect(w.rev).toBeGreaterThan(before)
    expect(w.dialogue?.key).toBe('firstsalt')
    expect(w.flags['fired:firstsalt']).toBe(true)
  })

  it('hands over the salt, restarts the timer, and shows the got box only the first time', () => {
    const w = shore()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 3000 }, content)
    apply(w, { type: 'interact' }, content) // dismiss the triggered line
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    expect(w.inventory.salt).toBe(1)
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'salt' })
    expect(w.flags['had:salt']).toBe(true)
    expect(orbAt(w)?.salt).toBe(false)
    expect(orbAt(w)?.nextAt).toBe(w.time + 3000)

    apply(w, { type: 'interact' }, content) // dismiss the got box
    apply(w, { type: 'tick', dt: 3000 }, content)
    expect(orbAt(w)?.salt).toBe(true)
    expect(w.dialogue).toBe(null) // the trigger has already fired, so no second line

    apply(w, { type: 'interact' }, content)
    expect(w.inventory.salt).toBe(2)
    expect(w.dialogue).toBe(null) // and no second got box
  })

  it('feeds the salt straight back into growing the island', () => {
    const w = shore()
    w.inventory.salt = 1
    apply(w, { type: 'interact' }, content) // salt in hand wins, so the orb stays in the bag
    expect(tileAt(w, 21, 16)).toBe('salt')
    expect(w.inventory).toEqual({ orb: 1, salt: 0 })
  })
})
