import { EventEmitter } from 'node:events'
import type Phaser from 'phaser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../game/actions'
import { startWalk } from '../game/boat'
import { createWorld, tileAt, type Obj } from '../game/world'
import { load, settings, world } from '../store'
import { crashIn, drawActor, inTheAir } from './crash'
import { hearWorld } from './speech'

afterEach(() => Object.assign(settings, { sfx: true, music: true, open: false }))

function sceneAudio() {
  const w = createWorld()
  w.left = 0
  w.tiles.fill('water')
  w.objects = [{ id: 'wreck', kind: 'boat', x: 10, y: 0, wrecked: true }]
  Object.assign(w.player, { x: 0, y: 0, facing: 'right' })
  w.inventory.orb = 1
  load(w)
  const events = new EventEmitter()
  const sounds: {
    play: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    resume: ReturnType<typeof vi.fn>
  }[] = []
  const sound = {
    mute: false,
    locked: false,
    play: vi.fn(),
    stopByKey: vi.fn(),
    add: vi.fn(() => {
      const clip = { play: vi.fn(), destroy: vi.fn(), pause: vi.fn(), resume: vi.fn() }
      sounds.push(clip)
      return clip
    }),
  }
  const fade = { stop: vi.fn() }
  const tweens = { add: vi.fn(() => fade) }
  const scene = { events, sound, tweens } as unknown as Phaser.Scene
  hearWorld(scene)
  const frame = (dt: number) => {
    apply(world, { type: 'tick', dt }, { dialogues: {}, items: {} })
    events.emit('postupdate')
  }
  return { w, scene, events, sound, sounds, frame, tweens, fade }
}

describe('world sound cues', () => {
  it('coalesces simultaneous interactions and drops muted, paused, and loaded history', () => {
    const { w, sound, frame, events } = sceneAudio()
    apply(w, { type: 'menu' }, { dialogues: {}, items: {} })
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(0)
    expect(sound.play).toHaveBeenCalledExactlyOnceWith('sfx/chime')
    frame(0)
    expect(sound.play).toHaveBeenCalledOnce()
    settings.sfx = false
    w.interactCue!++
    frame(0)
    settings.sfx = true
    frame(0)
    expect(sound.play).toHaveBeenCalledOnce()
    w.interactCue!++
    events.emit('pause')
    events.emit('resume')
    frame(0)
    expect(sound.play).toHaveBeenCalledOnce()
    const snapshot = structuredClone(w)
    snapshot.interactCue = 100
    load(snapshot)
    frame(0)
    expect(sound.play).toHaveBeenCalledOnce()
    world.interactCue!++
    frame(0)
    expect(sound.play).toHaveBeenCalledTimes(2)
    events.emit('shutdown')
    expect(sound.stopByKey).toHaveBeenCalledWith('sfx/interact')
  })

  it('fades Salty Ditty in before the ship appears and stops it at the crash', () => {
    const { w, sound, sounds, events, tweens, fade } = sceneAudio()
    w.dialogue = { key: 'pirate', node: '1', choice: 0 }
    events.emit('postupdate')
    expect(sound.add).toHaveBeenCalledWith('music/saltyditty', {
      loop: true,
      volume: 0,
      mute: false,
    })
    const music = sounds[0]
    expect(tweens.add).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: music,
        volume: 0.6,
        duration: 1500,
      }),
    )
    w.dialogue.node = '4'
    const boat: Obj = { id: 'ship', kind: 'boat', x: 0, y: 0 }
    w.objects.push(boat)
    events.emit('postupdate')
    expect(music.play).toHaveBeenCalledOnce()
    expect(music.destroy).not.toHaveBeenCalled()
    boat.wrecked = true
    events.emit('postupdate')
    expect(fade.stop).toHaveBeenCalledOnce()
    expect(music.destroy).toHaveBeenCalledOnce()
    expect(sound.play).toHaveBeenCalledExactlyOnceWith('sfx/crash')
    expect(music.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      sound.play.mock.invocationCallOrder[0],
    )
    events.emit('postupdate')
    expect(music.play).toHaveBeenCalledOnce()
  })

  it('keeps entrance music independent of SFX and handles pause and shutdown', () => {
    const { w, sounds, sound, events, fade } = sceneAudio()
    settings.music = false
    settings.sfx = false
    w.dialogue = { key: 'pirate', node: '1', choice: 0 }
    events.emit('postupdate')
    expect(sound.add).toHaveBeenCalledWith('music/saltyditty', {
      loop: true,
      volume: 0,
      mute: true,
    })
    events.emit('pause')
    expect(sounds[0].pause).toHaveBeenCalledOnce()
    events.emit('resume')
    expect(sounds[0].resume).toHaveBeenCalledOnce()
    events.emit('shutdown')
    expect(fade.stop).toHaveBeenCalledOnce()
    expect(sounds[0].destroy).toHaveBeenCalledOnce()
    expect(events.listenerCount('resume')).toBe(0)
  })

  it('cleans up entrance music on a world load and never starts it during later pirate dialogue', () => {
    const { w, sounds, sound, events } = sceneAudio()
    w.dialogue = { key: 'pirate', node: '1', choice: 0 }
    events.emit('postupdate')
    load(createWorld())
    events.emit('postupdate')
    expect(sounds[0].destroy).toHaveBeenCalledOnce()
    world.dialogue = { key: 'pirate', node: '21', choice: 0 }
    events.emit('postupdate')
    expect(sound.add).toHaveBeenCalledOnce()
  })

  it('hisses exactly three times after landing and before the two-second salt change', () => {
    const { w, sound, sounds, frame } = sceneAudio()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(299)
    expect(sound.add).not.toHaveBeenCalled()
    frame(1)
    expect(sound.add).toHaveBeenCalledWith('sfx/hiss')
    expect(sounds[0].play).toHaveBeenCalledTimes(1)
    frame(549)
    expect(sounds[0].play).toHaveBeenCalledTimes(1)
    frame(1)
    expect(sounds[0].play).toHaveBeenCalledTimes(2)
    frame(550)
    expect(sounds[0].play).toHaveBeenCalledTimes(3)
    frame(599)
    expect(tileAt(w, 1, 0)).toBe('water')
    frame(1)
    expect(tileAt(w, 1, 0)).toBe('salt')
    expect(sounds[0].destroy).toHaveBeenCalledOnce()
    frame(2000)
    expect(sounds[0].play).toHaveBeenCalledTimes(3)
  })

  it('cancels when the orb is picked up and gives a rethrow its own three bursts', () => {
    const { w, sounds, frame } = sceneAudio()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(300)
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(0)
    expect(sounds[0].destroy).toHaveBeenCalledOnce()
    frame(2000)
    expect(sounds[0].play).toHaveBeenCalledOnce()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    for (const dt of [300, 550, 550]) frame(dt)
    expect(sounds[1].play).toHaveBeenCalledTimes(3)
  })

  it('does not replay missed bursts after mute, an audio lock, or a slow frame', () => {
    const { w, sound, sounds, frame } = sceneAudio()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    settings.sfx = false
    frame(300)
    settings.sfx = true
    sound.locked = true
    frame(550)
    sound.locked = false
    frame(550)
    expect(sounds[0].play).toHaveBeenCalledOnce()
    frame(600)
    w.inventory.orb = 1
    w.player.facing = 'down'
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(1450)
    expect(sounds[1].play).toHaveBeenCalledOnce()
  })

  it('stops on pause and shutdown without leaving callbacks or playing loaded history', () => {
    const { w, events, sound, sounds, frame } = sceneAudio()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    frame(300)
    events.emit('pause')
    expect(sounds[0].destroy).toHaveBeenCalledOnce()
    frame(0)
    expect(sound.add).toHaveBeenCalledTimes(1)
    const snapshot = structuredClone(w)
    snapshot.time = 1450
    load(snapshot)
    frame(0)
    expect(sound.add).toHaveBeenCalledTimes(1)
    events.emit('shutdown')
    expect(events.listenerCount('postupdate')).toBe(0)
    expect(events.listenerCount('pause')).toBe(0)
    expect(sound.stopByKey).toHaveBeenCalledWith('sfx/crash')
  })

  it('plays one crash for a newly wrecked ship, not a wreck already in the map', () => {
    const { w, sound, frame } = sceneAudio()
    frame(0)
    expect(sound.play).not.toHaveBeenCalled()
    const boat: Obj = { id: 'ship', kind: 'boat', x: 0, y: 0 }
    w.objects.push(boat)
    frame(0)
    w.tiles[1] = 'salt'
    startWalk(w, { id: 'ship', path: ['right'] })
    frame(0)
    expect(sound.play).toHaveBeenCalledExactlyOnceWith('sfx/crash')
    frame(1000)
    expect(sound.play).toHaveBeenCalledOnce()
  })
})

it('draws the pirate from his seat through a full somersault and back onto his feet', () => {
  sceneAudio()
  const pirate: Obj = {
    id: 'etarp',
    kind: 'npc',
    sprite: 'etarp',
    dialogue: 'etarp',
    facing: 'left',
    x: 21,
    y: 8,
    step: { x: 20, y: 8, t: 0 },
    thrown: { x: 21.5, y: 8 - 1 / 16, at: 0 },
  }
  const sprite = {
    originY: 0.5,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setFrame: vi.fn().mockReturnThis(),
  }
  const s = sprite as unknown as Phaser.GameObjects.Sprite
  inTheAir(s, pirate)
  expect(sprite.setPosition).toHaveBeenLastCalledWith(352, 131)
  pirate.step!.t = 0.5
  inTheAir(s, pirate)
  expect(sprite.setPosition).toHaveBeenLastCalledWith(340, 103.5)
  expect(sprite.setRotation).toHaveBeenLastCalledWith(Math.PI)
  pirate.x = 20
  pirate.step = null
  delete pirate.thrown
  drawActor(s, pirate, 'etarp')
  inTheAir(s, pirate)
  expect(sprite.setPosition).toHaveBeenLastCalledWith(320, 144)
  expect(sprite.setOrigin).toHaveBeenLastCalledWith(0, 1)
  expect(sprite.setRotation).toHaveBeenLastCalledWith(0)
  expect(sprite.setDepth).toHaveBeenLastCalledWith(144)
})

it.each([true, false])('sounds the opening crash at visible impact with sfx=%s', (enabled) => {
  const { scene, sound } = sceneAudio()
  settings.sfx = enabled
  const sprite = {
    x: 0,
    y: 0,
    depth: 0,
    setPosition: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
  }
  const tweens = { add: vi.fn() }
  Object.assign(scene, { tweens, cameras: { main: { shake: vi.fn() } } })
  const s = sprite as unknown as Phaser.GameObjects.Sprite
  crashIn(scene, { boat: s, mich: s, player: s, orb: s }, vi.fn())
  expect(sound.play).not.toHaveBeenCalled()
  tweens.add.mock.calls[0][0].onComplete()
  expect(sound.play).toHaveBeenCalledTimes(enabled ? 1 : 0)
})
