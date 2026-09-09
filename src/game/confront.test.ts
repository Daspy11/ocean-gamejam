import { describe, expect, it } from 'vitest'
import { startWalk, tickWalks } from './boat'
import { startFire, tickCannons } from './cannon'
import { blast } from './machine'
import { DIRS, createWorld, npc, objectAt, tileAt, type Obj } from './world'

describe('Tarq confronting Mich', () => {
  it.each([1, 7, 123, 999])(
    'approaches her and leaves a straight, empty salt retreat with seed %i',
    (seed) => {
      const w = createWorld()
      w.seed = seed
      w.objects = w.objects.filter((o) => o.id !== 'orb1')
      const mich = w.objects.find((o) => o.id === 'mich') as Obj & { kind: 'npc' }
      Object.assign(mich, { x: 13, y: 14 })
      blast(w, 13, 14)
      w.objects.push(
        { id: 'cannon', kind: 'cannon', x: 18, y: 15 },
        { id: 'egg', kind: 'egg', x: 15, y: 17 },
        { id: 'certificate', kind: 'certificate', x: 17, y: 17 },
      )
      startFire(w, 'cannon')
      w.time = 4000
      tickCannons(w)
      const rug: Obj = { id: 'rug', kind: 'flyingcarpet', x: 0, y: 17 }
      w.objects.push(rug, Object.assign(npc('tarq', 'tarq', 0, 17, 'right', ''), { ride: 'rug' }))
      startWalk(w, { id: 'rug', near: 'mich', retreat: 4, run: true })
      expect(rug.step).toBeTruthy()
      for (let i = 0; i < 40; i++) {
        w.time += 125
        tickWalks(w, 125)
      }
      expect([mich.x, mich.y]).toEqual([13, 14])
      const [dx, dy] = DIRS[mich.facing]
      expect([rug.x, rug.y]).toEqual([mich.x + dx * 3, mich.y + dy * 3])
      for (let n = 1; n <= 4; n++) {
        const [x, y] = [mich.x - dx * n, mich.y - dy * n]
        expect(tileAt(w, x, y)).toBe('salt')
        expect(objectAt(w, x, y)).toBeUndefined()
      }
      const facing = mich.facing
      startWalk(w, { id: 'mich', back: 4 })
      for (let i = 0; i < 16; i++) {
        w.time += 125
        tickWalks(w, 125)
        expect(mich.facing).toBe(facing)
        expect(mich.x === 13 || mich.y === 14).toBe(true)
      }
      expect([mich.x, mich.y]).toEqual([13 - dx * 4, 14 - dy * 4])
      startWalk(w, { id: 'rug', near: 'mich', retreat: 0 })
      for (let i = 0; i < 20; i++) {
        w.time += 125
        tickWalks(w, 125)
      }
      expect([rug.x, rug.y]).toEqual([mich.x + dx * 2, mich.y + dy * 2])
    },
  )
})
