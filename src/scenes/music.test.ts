import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type Phaser from 'phaser'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../game/actions'
import { createWorld, type Content } from '../game/world'
import { load, settings, world } from '../store'
import { background, hearWorld } from './speech'

afterEach(() => {
  settings.music = true
  settings.sfx = true
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
    mute: false,
    locked: false,
    play: vi.fn(),
    stopByKey: vi.fn(),
    get: (key: string) => clips.get(key),
    add: vi.fn((key: string) => {
      const clip =
        key === 'music/ambient'
          ? music
          : {
              play: vi.fn(),
              pause: vi.fn(),
              resume: vi.fn(),
              destroy: vi.fn(() => clips.delete(key)),
            }
      clips.set(key, clip)
      return clip
    }),
  }
  const scene = {
    sound,
    events,
    game: { events },
    tweens: { add: vi.fn(() => ({ stop: vi.fn() })) },
  } as unknown as Phaser.Scene
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

it.each([true, false])(
  'replaces ambient during Walter’s plea and restores it after joining: %s',
  (yes) => {
    const { scene, sound, music, events, clips } = musicScene()
    const content: Content = {
      dialogues: {
        tarq: JSON.parse(
          readFileSync(new URL('../../assets/dialogue/tarq.json', import.meta.url), 'utf8'),
        ),
      },
      items: {},
    }
    background(scene)
    hearWorld(scene)
    events.emit('step', 1500, 1500)
    world.dialogue = { key: 'tarq', node: 'crab3', choice: 0 }
    apply(world, { type: 'interact' }, content)
    events.emit('postupdate')
    expect(sound.add).toHaveBeenCalledWith('music/heartbreaking', {
      loop: true,
      volume: 0,
      mute: false,
    })
    const song = clips.get('music/heartbreaking') as {
      play: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
    }
    events.emit('step', 3000, 1500)
    expect(music.volume).toBe(0)
    apply(world, { type: 'tick', dt: 1000 }, content)
    for (const node of ['crab5', 'crab6', 'crab6a', 'crab6b', 'crab7']) {
      expect(world.dialogue?.node).toBe(node)
      events.emit('postupdate')
      apply(world, { type: 'interact' }, content)
    }
    expect(world.dialogue?.node).toBe('ask')
    if (!yes)
      for (let i = 0; i < 2; i++) {
        apply(world, { type: 'move', dir: 'down' }, content)
        apply(world, { type: 'interact' }, content)
        events.emit('postupdate')
      }
    expect(song.play).toHaveBeenCalledOnce()
    expect(song.destroy).not.toHaveBeenCalled()
    if (!yes) apply(world, { type: 'move', dir: 'down' }, content)
    apply(world, { type: 'interact' }, content)
    expect(world.dialogue?.node).toBe(yes ? 'yay' : 'bye')
    events.emit('postupdate')
    expect(song.destroy).toHaveBeenCalledOnce()
    events.emit('step', 4500, 1500)
    expect(music.volume).toBe(0.175)
  },
)

it('mutes, pauses, and cleans up Walter’s music on world replacement and shutdown', () => {
  const { scene, sound, events, clips } = musicScene()
  settings.music = false
  settings.sfx = false
  hearWorld(scene)
  world.dialogue = { key: 'tarq', node: 'ask', choice: 0 }
  events.emit('postupdate')
  expect(sound.add).toHaveBeenCalledWith('music/heartbreaking', {
    loop: true,
    volume: 0,
    mute: true,
  })
  const song = clips.get('music/heartbreaking') as {
    pause: ReturnType<typeof vi.fn>
    resume: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }
  events.emit('pause')
  expect(song.pause).toHaveBeenCalledOnce()
  events.emit('resume')
  expect(song.resume).toHaveBeenCalledOnce()
  load(createWorld())
  events.emit('postupdate')
  expect(song.destroy).toHaveBeenCalledOnce()
  world.dialogue = { key: 'tarq', node: 'ask', choice: 0 }
  events.emit('postupdate')
  const next = clips.get('music/heartbreaking') as typeof song
  events.emit('shutdown')
  expect(next.destroy).toHaveBeenCalledOnce()
})
