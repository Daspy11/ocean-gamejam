import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import Outro from './Outro'

vi.mock('phaser', () => ({ default: { Scene: vi.fn() } }))
vi.mock('./Settings', () => ({ bindControls: () => () => ({}), openSettings: vi.fn() }))

it('opens the iris without a black flash and keeps the handed-over loop until credits shut down', () => {
  const scene = new Outro()
  const events = new EventEmitter()
  const music = { play: vi.fn(), destroy: vi.fn() }
  const hole = {
    fillStyle: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    createGeometryMask: () => ({ setInvertAlpha: vi.fn() }),
  }
  const black = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setMask: vi.fn(),
  }
  const sound = { add: vi.fn(), stopAll: vi.fn() }
  const time = { now: 100, delayedCall: vi.fn() }
  Object.assign(scene, {
    events,
    sound,
    time,
    make: { graphics: () => hole },
    add: { rectangle: () => black },
  })
  scene.create({ music } as unknown as Parameters<Outro['create']>[0])
  expect(hole.fillCircle).toHaveBeenLastCalledWith(320, 150, 480)
  scene.update()
  time.now += 1200
  scene.update()
  expect(hole.fillCircle).toHaveBeenLastCalledWith(320, 150, 240)
  time.now += 1200
  scene.update()
  expect(hole.fillCircle).toHaveBeenLastCalledWith(320, 150, 0)
  expect(sound.add).not.toHaveBeenCalled()
  expect(sound.stopAll).not.toHaveBeenCalled()
  expect(music.play).not.toHaveBeenCalled()
  expect(music.destroy).not.toHaveBeenCalled()
  events.emit('shutdown')
  expect(music.destroy).toHaveBeenCalledOnce()
})
