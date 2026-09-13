import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type Phaser from 'phaser'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../game/actions'
import { createWorld, type Content } from '../game/world'
import { load, settings } from '../store'
import { hearWorld } from './speech'

const content: Content = {
  items: {},
  dialogues: {
    flower: JSON.parse(
      readFileSync(new URL('../../assets/dialogue/flower.json', import.meta.url), 'utf8'),
    ),
  },
}
afterEach(() => Object.assign(settings, { sfx: true, open: false }))

function powerScene() {
  const w = createWorld()
  w.dialogue = { key: 'flower', node: '20', choice: 0 }
  load(w)
  const events = new EventEmitter()
  const charge = { play: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }
  const sound = {
    add: vi.fn(() => charge),
    play: vi.fn(),
    stopByKey: vi.fn(),
    mute: false,
    locked: false,
  }
  hearWorld({ events, sound } as unknown as Phaser.Scene)
  const frame = (dt: number) => {
    apply(w, { type: 'tick', dt }, content)
    events.emit('postupdate')
  }
  const start = () => {
    apply(w, { type: 'interact' }, content)
    events.emit('postupdate')
  }
  return { w, events, sound, charge, frame, start }
}

it('charges after the actual I’m line and chimes at the end of the 1200 ms white shake', () => {
  const { w, sound, charge, frame, start } = powerScene()
  frame(0)
  expect(sound.add).not.toHaveBeenCalled()
  start()
  expect(sound.add).toHaveBeenCalledExactlyOnceWith('sfx/powerup')
  expect(charge.play).toHaveBeenCalledOnce()
  frame(1000)
  expect(w.closeup?.burst).toBe(1000)
  frame(1199)
  expect(sound.play).not.toHaveBeenCalled()
  frame(1)
  expect(charge.destroy).toHaveBeenCalledOnce()
  expect(sound.play).toHaveBeenCalledExactlyOnceWith('sfx/chime')
  frame(800)
  expect(w.dialogue?.node).toBe('20c')
  expect(sound.play).toHaveBeenCalledOnce()
})

it('pauses the charge with the scene and removes it on shutdown', () => {
  const { events, charge, start, frame } = powerScene()
  start()
  settings.open = true
  frame(0)
  expect(charge.destroy).not.toHaveBeenCalled()
  events.emit('pause')
  expect(charge.pause).toHaveBeenCalled()
  settings.open = false
  events.emit('resume')
  expect(charge.resume).toHaveBeenCalledOnce()
  events.emit('shutdown')
  expect(charge.destroy).toHaveBeenCalledOnce()
})

it('drops muted and loaded history without replaying the power-up or chime', () => {
  const { w, charge, sound, frame, start, events } = powerScene()
  start()
  settings.sfx = false
  frame(1000)
  expect(charge.destroy).toHaveBeenCalledOnce()
  frame(1200)
  settings.sfx = true
  frame(0)
  expect(sound.play).not.toHaveBeenCalled()
  load(structuredClone(w))
  events.emit('postupdate')
  expect(sound.add).toHaveBeenCalledOnce()
  expect(sound.play).not.toHaveBeenCalled()
})
