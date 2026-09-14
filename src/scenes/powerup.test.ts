import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type Phaser from 'phaser'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../game/actions'
import { armMachine } from '../game/machine'
import { createWorld, npc, type Content } from '../game/world'
import { load, settings } from '../store'
import { hearWorld } from './speech'

const content: Content = {
  items: {},
  dialogues: Object.fromEntries(
    ['flower', 'seahorse', 'pirate', 'etarp', 'cannon'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
}
afterEach(() => Object.assign(settings, { sfx: true, open: false }))

function powerScene(key = 'flower') {
  const w = createWorld()
  const nodes: Record<string, string> = {
    flower: '20',
    seahorse: 'given',
    pirate: '21',
    etarp: 'iFound',
    cannon: 'iApproach',
  }
  w.dialogue = { key, node: nodes[key], choice: key === 'pirate' ? 1 : 0 }
  w.inventory.glassi = 1
  w.objects.push(npc('etarp', 'etarp', 22, 2, 'down', 'etarp'))
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
    apply(w, key === 'cannon' ? { type: 'tick', dt: 0 } : { type: 'interact' }, content)
    events.emit('postupdate')
  }
  return { w, events, sound, charge, frame, start }
}

it.each(['flower', 'seahorse', 'pirate', 'etarp', 'cannon'])(
  'charges and chimes at the end of the white shake in %s',
  (key) => {
    const { w, sound, charge, frame, start } = powerScene(key)
    expect(sound.add).not.toHaveBeenCalled()
    start()
    sound.play.mockClear() // selecting the arrival's gift choice has its own menu chime
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
    if (w.closeup?.auto) frame(1000)
    const nodes: Record<string, string> = {
      flower: '20c',
      seahorse: 'delicious',
      pirate: 'iYarr',
      etarp: 'iMine',
      cannon: 'iMine',
    }
    expect(w.dialogue?.node).toBe(nodes[key])
    expect(sound.play).toHaveBeenCalledOnce()
  },
)

it.each(['flower', 'seahorse', 'pirate', 'etarp', 'cannon'])(
  'pauses the charge and removes it on shutdown in %s',
  (key) => {
    const { events, charge, start, frame } = powerScene(key)
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
  },
)

it.each(['flower', 'seahorse', 'pirate', 'etarp', 'cannon'])(
  'does not replay muted or loaded charge sounds in %s',
  (key) => {
    const { w, charge, sound, frame, start, events } = powerScene(key)
    start()
    sound.play.mockClear()
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
  },
)

it.each(['audible', 'muted', 'locked', 'settings'])(
  'plays the boat crash once at extractor impact, with audio %s',
  (mode) => {
    const { w, sound, frame, events } = powerScene('seahorse')
    w.dialogue = null
    w.objects.push({ id: 'desalinator', kind: 'machine', x: 13, y: 14 })
    armMachine(w, 'desalinator')
    settings.sfx = mode !== 'muted'
    sound.locked = mode === 'locked'
    settings.open = mode === 'settings'
    frame(1999)
    expect(sound.play).not.toHaveBeenCalled()
    frame(1)
    expect(w.objects.some((o) => o.id === 'desalinator')).toBe(false)
    if (mode === 'audible') expect(sound.play).toHaveBeenCalledExactlyOnceWith('sfx/crash')
    else expect(sound.play).not.toHaveBeenCalled()
    Object.assign(settings, { sfx: true, open: false })
    sound.locked = false
    frame(0)
    frame(2000)
    load(structuredClone(w))
    events.emit('postupdate')
    expect(sound.play).toHaveBeenCalledTimes(mode === 'audible' ? 1 : 0)
  },
)
