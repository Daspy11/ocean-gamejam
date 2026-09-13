import { EventEmitter } from 'node:events'
import type Phaser from 'phaser'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorld } from '../game/world'
import { load, settings, world } from '../store'
import { background } from './speech'

afterEach(() => {
  settings.music = true
})

function musicScene() {
  load(createWorld())
  const events = new EventEmitter()
  const clips = new Map<string, unknown>()
  const music = Object.assign(new EventEmitter(), {
    volume: 0,
    play: vi.fn(),
    setVolume: vi.fn((volume: number) => {
      music.volume = volume
    }),
  })
  const sound = {
    get: (key: string) => clips.get(key),
    add: vi.fn((key: string) => {
      clips.set(key, music)
      return music
    }),
  }
  const scene = { sound, game: { events } } as unknown as Phaser.Scene
  return { scene, sound, music, events, clips }
}

it('fades in one ambient loop and keeps it across scene handovers', () => {
  const { scene, sound, music, events } = musicScene()
  background(scene)
  expect(sound.add).toHaveBeenCalledWith('music/ambient', { loop: true, volume: 0, mute: false })
  expect(music.play).toHaveBeenCalledOnce()
  events.emit('step', 750, 750)
  expect(music.volume).toBeCloseTo(0.0875)
  events.emit('step', 1500, 750)
  expect(music.volume).toBeCloseTo(0.175)
  background(scene)
  expect(sound.add).toHaveBeenCalledOnce()
  expect(events.listenerCount('step')).toBe(1)
  music.emit('destroy')
  expect(events.listenerCount('step')).toBe(0)
})

it('waits for title music, yields to Etarp, and fades to silence before the outro', () => {
  const { scene, music, events, clips } = musicScene()
  clips.set('music/nowhereland', {})
  background(scene)
  events.emit('step', 2000, 2000)
  expect(music.volume).toBe(0)
  clips.delete('music/nowhereland')
  events.emit('step', 3500, 1500)
  expect(music.volume).toBe(0.175)
  clips.set('music/saltyditty', {})
  events.emit('step', 5000, 1500)
  expect(music.volume).toBe(0)
  clips.delete('music/saltyditty')
  events.emit('step', 6500, 1500)
  expect(music.volume).toBe(0.175)
  world.flags.outro = true
  events.emit('step', 7250, 750)
  expect(music.volume).toBeCloseTo(0.0875)
  events.emit('step', 8000, 750)
  expect(music.volume).toBe(0)
  events.emit('step', 9000, 1000)
  expect(music.volume).toBe(0)
})

it('starts muted when music is disabled', () => {
  const { scene, sound } = musicScene()
  settings.music = false
  background(scene)
  expect(sound.add).toHaveBeenCalledWith('music/ambient', expect.objectContaining({ mute: true }))
})
