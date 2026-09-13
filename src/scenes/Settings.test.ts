import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settings } from '../store'
import Settings, { KEYS } from './Settings'

vi.mock('phaser', () => ({
  default: {
    Scene: vi.fn(),
    Input: {
      Keyboard: {
        JustDown: (key: { down: boolean }) => {
          const down = key.down
          key.down = false
          return down
        },
      },
    },
  },
}))
afterEach(() => {
  Object.assign(settings, { open: false, music: true, sfx: true })
  vi.unstubAllGlobals()
})

function menu(running: string[], title = false) {
  const active = new Set([...running, 'settings'])
  const paused = new Set<string>()
  const events = new EventEmitter()
  const loop = { time: 1000 }
  const queue: (() => void)[] = []
  const backgrounds = running.map((key) => ({
    scene: { key },
    events: new EventEmitter(),
    tweens: { startTime: 0, prevTime: 0 },
    sys: { isPaused: () => paused.has(key) },
  }))
  const keys = Object.fromEntries(KEYS.split(',').map((key) => [key, { down: false }]))
  const input = Object.assign(new EventEmitter(), { keyboard: { addKeys: () => keys } })
  const parts: (EventEmitter & { x: number; y: number; text: string })[] = []
  function picture(x: number, y: number, _font?: string, text = '') {
    const p = Object.assign(new EventEmitter(), {
      x,
      y,
      text,
      width: text.length * 8,
      setOrigin: vi.fn().mockReturnThis(),
      setInteractive: vi.fn().mockReturnThis(),
      setDropShadow: vi.fn().mockReturnThis(),
      setX(n: number) {
        p.x = n
        return p
      },
      setY(n: number) {
        p.y = n
        return p
      },
      setText(text: string) {
        p.text = text
        return p
      },
    })
    parts.push(p)
    return p
  }
  const music = { setMute: vi.fn() }
  const play = vi.fn()
  const overlay = new Settings()
  const scene = {
    manager: { getScenes: () => backgrounds },
    pause: (key: string) =>
      queue.push(() => {
        active.delete(key)
        paused.add(key)
      }),
    resume: (key: string) =>
      queue.push(() => {
        paused.delete(key)
        active.add(key)
      }),
    stop: () =>
      queue.push(() => {
        active.delete('settings')
        events.emit('shutdown')
      }),
    bringToTop: vi.fn(),
  }
  Object.assign(overlay, {
    scene,
    events,
    input,
    game: { loop },
    sound: { play, getAll: (key: string) => (key === 'music/nowhereland' ? [music] : []) },
    add: { rectangle: picture, nineslice: picture, bitmapText: picture },
  })
  const storage = { setItem: vi.fn() }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { getGamepads: () => [] })
  overlay.create({ title })
  const flush = () => {
    while (queue.length) queue.shift()!()
  }
  flush()
  return {
    overlay,
    active,
    paused,
    loop,
    backgrounds,
    keys,
    input,
    parts,
    music,
    storage,
    flush,
    play,
  }
}

describe('settings overlay', () => {
  it('chimes on opening, selection, toggles, and closing while respecting SFX mute', () => {
    const { overlay, keys, play } = menu(['island'])
    expect(play).toHaveBeenCalledExactlyOnceWith('sfx/chime')
    keys.DOWN.down = true
    overlay.update()
    expect(play).toHaveBeenCalledTimes(2)
    keys.ENTER.down = true
    overlay.update()
    expect(settings.sfx).toBe(false)
    expect(play).toHaveBeenCalledTimes(2)
    keys.ENTER.down = true
    overlay.update()
    expect(play).toHaveBeenCalledTimes(3)
    keys.ESC.down = true
    overlay.update()
    expect(play).toHaveBeenCalledTimes(4)
  })

  it.each([['intro'], ['island', 'ui'], ['cave', 'ui'], ['island', 'ui', 'outro']])(
    'pauses and restores only the active scene stack: %j',
    (...running) => {
      const { overlay, active, paused, keys, loop, backgrounds, flush } = menu(running)
      expect([...active]).toEqual(['settings'])
      expect([...paused]).toEqual(running)
      expect(settings.open).toBe(true)
      const resume = vi.fn()
      backgrounds[0].events.on('settings-resume', resume)
      loop.time += 10000
      keys.ESC.down = true
      overlay.update()
      flush()
      expect(resume).toHaveBeenCalledWith(10000)
      expect([...active]).toEqual(running)
      expect(paused.size).toBe(0)
      expect(settings.open).toBe(false)
    },
  )

  it('leaves the title animated and resumes no stopped scenes', () => {
    const { overlay, active, paused, keys, flush } = menu(['intro'], true)
    expect([...active]).toEqual(['intro', 'settings'])
    expect(paused.size).toBe(0)
    keys.X.down = true
    overlay.update()
    flush()
    expect([...active]).toEqual(['intro'])
  })

  it('toggles music and sfx separately, persists them and shows read-only controls', () => {
    const { overlay, keys, parts, music, storage } = menu(['island', 'ui'])
    keys.Z.down = true
    overlay.update()
    expect(settings).toMatchObject({ music: false, sfx: true })
    expect(music.setMute).toHaveBeenCalledWith(true)
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'boatiful-settings',
      '{"music":false,"sfx":true}',
    )
    const sfx = parts.find((p) => p.text === 'sfx: on')!
    keys.DOWN.down = true
    keys.ENTER.down = true
    overlay.update()
    expect(settings).toMatchObject({ music: false, sfx: false })
    expect(music.setMute).toHaveBeenCalledTimes(1)
    expect(sfx.text).toBe('sfx: off')
    const bindings = parts.find(
      (p) => typeof p.text === 'string' && p.text.includes('move / select'),
    )!
    expect(bindings.text).toContain('Enter / Space / E / Z / left click')
    expect(bindings.listenerCount('pointerdown')).toBe(0)
  })

  it('closes with the keyboard and does not resume a scene stopped meanwhile', () => {
    const { overlay, keys, paused, active, flush } = menu(['intro'])
    paused.delete('intro')
    keys.UP.down = true
    keys.ENTER.down = true
    overlay.update()
    flush()
    expect([...active]).toEqual([])
    expect(settings.open).toBe(false)
  })

  it('ignores clicks on and outside options, including when close is selected', () => {
    const { overlay, input, keys, parts, active, flush, storage } = menu(['island', 'ui'])
    parts.find((p) => p.text === 'music: on')!.emit('pointerdown', { button: 0 })
    input.emit('pointerdown', { button: 0 })
    overlay.update()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(settings.music).toBe(true)
    keys.UP.down = true
    overlay.update()
    parts.find((p) => p.text === 'close')!.emit('pointerdown', { button: 0 })
    input.emit('pointerdown', { button: 0 })
    overlay.update()
    flush()
    expect(active.has('settings')).toBe(true)
    keys.ENTER.down = true
    overlay.update()
    flush()
    expect([...active]).toEqual(['island', 'ui'])
  })

  it('does not activate options with the middle or right mouse button', () => {
    const { overlay, input, parts, storage, flush } = menu(['island', 'ui'])
    const music = parts.find((p) => p.text === 'music: on')!
    for (const button of [1, 2]) {
      music.emit('pointerdown', { button })
      input.emit('pointerdown', { button })
      overlay.update()
    }
    flush()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(settings.music).toBe(true)
    expect(settings.open).toBe(false)
  })
})
