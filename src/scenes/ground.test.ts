import type Phaser from 'phaser'
import { expect, it, vi } from 'vitest'
import { createWorld } from '../game/world'
import { load } from '../store'
import { syncGround } from './ground'
import Island from './Island'

vi.mock('phaser', () => ({ default: { Scene: vi.fn() } }))

it.each(['island', 'cave'] as const)(
  'switches the %s scene at its doorway without stale crash data',
  (area) => {
    const w = createWorld(area)
    const inside = area === 'cave'
    Object.assign(w.player, {
      x: inside ? 10 : 42,
      y: inside ? 8 : 18,
      step: { x: inside ? 10 : 42, y: inside ? 9 : 17, t: 0 },
    })
    load(w)
    const scene = new Island(area)
    const start = vi.fn()
    Object.assign(scene, { scene: { key: area, start } })
    ;(scene as unknown as { frame: (dt: number) => void }).frame(250)
    expect(start).toHaveBeenCalledWith(inside ? 'island' : 'cave', {})
  },
)

it('puts the west island outside the view at four steps and inside it at five without flags', () => {
  const w = createWorld()
  load(w)
  const layers = Array.from({ length: 7 }, () => ({ putTileAt: vi.fn() }))
  syncGround(layers as unknown as Phaser.Tilemaps.TilemapLayer[])
  const westernSand = layers[2].putTileAt.mock.calls.filter(
    ([frame, x]) => frame >= 0 && x + (w.left ?? 0) < 0,
  )
  expect(westernSand.length).toBeGreaterThan(0)
  const rightEdge = Math.max(...westernSand.map(([, x]) => (x + (w.left ?? 0)) * 16 + 8))
  const shore = 13
  expect(rightEdge).toBeLessThanOrEqual((shore - 4 + 0.5) * 16 - 640 / 2 / 2)
  expect(rightEdge).toBeGreaterThan((shore - 5 + 0.5) * 16 - 640 / 2 / 2)
  expect((w.left ?? 0) * 16).toBeLessThan((shore - 5 + 0.5) * 16 - 640 / 2 / 2)
  expect(w.flags).toEqual({})
})
