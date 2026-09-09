import { describe, expect, it } from 'vitest'
import { startFire, tickCannons } from './cannon'
import { putBy } from './machine'
import { createWorld, npc, objectAt, type Obj } from './world'

describe('the cannons fighting during departure', () => {
  it.each(['embedded', 'floor'] as const)(
    'stands the cannon over %s instead of above its owner',
    (kind) => {
      const w = createWorld()
      w.tiles.fill('salt')
      w.objects = [
        npc('seahorse', 'seahorse', 13, 15, 'right', ''),
        { id: 'ground', kind, x: 14, y: 15 },
      ]
      putBy(w, { by: 'seahorse', obj: { id: 'cannon2', kind: 'cannon', x: 0, y: 0, right: true } })
      expect(objectAt(w, 14, 15)).toMatchObject({ id: 'cannon2', right: true })
      expect(w.objects.some((o) => o.id === 'ground')).toBe(true)
      expect(w.score).toBe(0)
    },
  )

  it('uses the next tile in front when the nearest one is solid, never the tile above', () => {
    const w = createWorld()
    w.tiles.fill('salt')
    w.objects = [
      npc('seahorse', 'seahorse', 13, 15, 'right', ''),
      { id: 'ground', kind: 'floor', x: 14, y: 15 },
      npc('mich', 'mich', 14, 15, 'right', ''),
    ]
    putBy(w, { by: 'seahorse', obj: { id: 'cannon2', kind: 'cannon', x: 0, y: 0, right: true } })
    expect(w.objects.find((o) => o.id === 'cannon2')).toMatchObject({ x: 15, y: 15 })
  })

  it('places the sea horse cannon in front of him, pointing east towards Etarp', () => {
    const w = createWorld()
    w.tiles.fill('salt')
    w.objects = [npc('seahorse', 'seahorse', 8, 17, 'right', '')]
    expect(
      putBy(w, {
        by: 'seahorse',
        obj: { id: 'cannon2', kind: 'cannon', x: 0, y: 0, right: true },
      }),
    ).toBe(true)
    expect(w.objects.find((o) => o.id === 'cannon2')).toMatchObject({ x: 9, y: 17, right: true })
  })

  it('keeps both guns firing, drains beauty rapidly, and confines the shots to the battle', () => {
    const w = createWorld()
    const left: Obj = { id: 'cannon', kind: 'cannon', x: 19, y: 17 }
    const right: Obj = { id: 'cannon2', kind: 'cannon', x: 8, y: 17, right: true }
    w.objects = [left, right]
    w.flags['fired:tarq'] = true
    startFire(w, left.id)
    expect(right.firing).toEqual(left.firing)
    expect(right.firing).toMatchObject({ ballAt: 500, until: 12500, duel: true })
    w.time = 250
    tickCannons(w)
    const firing = structuredClone(right.firing)
    startFire(w, right.id)
    expect(right.firing).toEqual(firing) // the later script cue must not restart either gun
    w.time = 499
    tickCannons(w)
    expect(w.objects.some((o) => o.kind === 'ball')).toBe(false)
    expect(w.score).toBe(0)
    w.time = 500
    tickCannons(w)
    const opening = w.objects.filter((o) => o.kind === 'ball' && o.at === 500)
    expect(opening.map((o) => o.x).sort((a, b) => a - b)).toEqual([8, 19])
    const score = w.score
    for (let i = 0; i < 60; i++) {
      w.time += 100
      tickCannons(w)
    }
    expect(left.firing).toBeTruthy()
    expect(right.firing).toBeTruthy()
    expect(w.score).toBeLessThanOrEqual(score - 600)
    const balls = w.objects.filter((o) => o.kind === 'ball')
    expect(balls.length).toBeGreaterThan(0)
    expect(balls.every((b) => b.kind === 'ball' && w.time - b.at < 500)).toBe(true)
    expect(new Set(balls.map((b) => b.id)).size).toBe(balls.length)
    expect(w.objects.some((o) => o.kind === 'embedded')).toBe(false)
  })

  it('measures the delay from the lift when boarding postpones takeoff', () => {
    const w = createWorld()
    const cannon: Obj = { id: 'cannon', kind: 'cannon', x: 19, y: 17 }
    w.objects = [
      cannon,
      { id: 'cannon2', kind: 'cannon', x: 9, y: 17, right: true },
      { id: 'rug', kind: 'flyingcarpet', x: 18, y: 17, liftAt: 200 },
    ]
    w.flags['fired:tarq'] = true
    startFire(w, cannon.id)
    expect(cannon.firing?.ballAt).toBe(700)
  })
})
