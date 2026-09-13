import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createWorld } from '../game/world'
import { load, settings, world } from '../store'
import Intro from './Intro'
import { KEYS } from './Settings'
import { background, speak } from './speech'

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
vi.mock('./speech', () => ({
  background: vi.fn(),
  playChime: vi.fn(),
  speak: vi.fn(),
  stopSpeech: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(settings, { open: false, confirmLabel: 'E' })
})

function intro(title: boolean, mute = false) {
  const scene = new Intro()
  const parts: (EventEmitter &
    Record<'x' | 'y' | 'alpha' | 'tilePositionX', number> &
    Record<'destroy' | 'setFrame', ReturnType<typeof vi.fn>> & {
      visible: boolean
      text: string
    })[] = []
  function picture(x = 0, y = 0, text = '') {
    const part = Object.assign(new EventEmitter(), {
      x,
      y,
      text,
      width: text.length * 8,
      height: 16,
      visible: true,
      alpha: 1,
      tilePositionX: 0,
      setOrigin: vi.fn().mockReturnThis(),
      setDropShadow: vi.fn().mockReturnThis(),
      setScale: vi.fn().mockReturnThis(),
      setFrame: vi.fn().mockReturnThis(),
      setTileScale: vi.fn().mockReturnThis(),
      setMaxWidth: vi.fn().mockReturnThis(),
      setSize: vi.fn().mockReturnThis(),
      setX: vi.fn((x: number) => {
        part.x = x
        return part
      }),
      setY: vi.fn((y: number) => {
        part.y = y
        return part
      }),
      setAlpha: vi.fn((alpha: number) => {
        part.alpha = alpha
        return part
      }),
      setText: vi.fn((text: string) => {
        part.text = text
        return part
      }),
      setVisible: vi.fn((visible: boolean) => {
        part.visible = visible
        return part
      }),
      getTextBounds: () => ({ wrappedText: '[PLACEHOLDER first line]' }),
      destroy: vi.fn(),
    })
    parts.push(part)
    return part
  }
  const events = new EventEmitter()
  const keys = Object.fromEntries(
    KEYS.split(',').map((key) => [key, { down: false, released: false }]),
  )
  const input = Object.assign(new EventEmitter(), { keyboard: { addKeys: () => keys } })
  const time = { now: 100 }
  const camera = Object.assign(new EventEmitter(), { shake: vi.fn(), fadeOut: vi.fn() })
  const cameras: { main: typeof camera | undefined } = { main: camera }
  // Phaser removes cameras before the scene's own shutdown hooks run.
  events.once('shutdown', () => {
    cameras.main = undefined
  })
  const start = vi.fn()
  const launch = vi.fn()
  const music = { play: vi.fn(), destroy: vi.fn() }
  const sound = { mute, add: vi.fn(() => music) }
  const rectangle = vi.fn((x: number, y: number) => picture(x, y))
  const tweens = {
    add: vi.fn<(config: { onComplete?: () => void }) => { stop: () => void }>(() => ({
      stop: vi.fn(),
    })),
  }
  Object.assign(scene, {
    events,
    input,
    time,
    cameras,
    sound,
    tweens,
    add: {
      rectangle,
      tileSprite: (x: number, y: number) => picture(x, y),
      image: picture,
      container: (x: number, y: number) => picture(x, y),
      nineslice: (x: number, y: number) => picture(x, y),
      bitmapText: (x: number, y: number, _font: string, text: string) => picture(x, y, text),
    },
    cache: {
      json: {
        get: (key: string) =>
          key === 'text/title'
            ? { start: 'start', soundOn: 'Sound: on', soundOff: 'Sound: off' }
            : {
                cast: { mich: { name: 'Mich' } },
                lines: [{ who: 'mich', text: '[PLACEHOLDER first line]' }],
              },
      },
    },
    scene: { start, launch },
  })
  scene.create({ title })
  return {
    scene,
    parts,
    keys,
    time,
    camera,
    cameras,
    sound,
    start,
    launch,
    music,
    input,
    events,
    tweens,
    rectangle,
  }
}

describe('title over the opening boat scene', () => {
  it('loops title music, fades it on start, and cleans it up on shutdown', () => {
    const { scene, sound, music, keys, tweens } = intro(true)
    expect(sound.add).toHaveBeenCalledWith('music/nowhereland', {
      loop: true,
      volume: 0.6,
      mute: !settings.music,
    })
    expect(music.play).toHaveBeenCalledOnce()
    keys.ENTER.down = true
    scene.update()
    const fade = tweens.add.mock.lastCall![0]
    expect(fade).toMatchObject({ targets: music, volume: 0, duration: 2000 })
    expect(background).not.toHaveBeenCalled()
    fade.onComplete!()
    expect(music.destroy).toHaveBeenCalledOnce()
    expect(background).toHaveBeenCalledExactlyOnceWith(scene)
  })

  it('also cleans up music when a debug jump interrupts the title', () => {
    const { music, events } = intro(true)
    events.emit('shutdown')
    expect(music.destroy).toHaveBeenCalledOnce()
    expect(intro(false).sound.add).not.toHaveBeenCalled()
  })

  it('shows the boat and both characters under the title without advancing dialogue or the world', () => {
    load(createWorld())
    const before = structuredClone(world)
    const { scene, parts, start, rectangle, input } = intro(true)
    expect(rectangle).not.toHaveBeenCalled()
    expect(parts.find((part) => part.text === 'start')!.x).toBe(320)
    for (const sprite of ['boat', 'mich', 'player', 'orb'])
      expect(parts.find((part) => part.text === `sprites/${sprite}`)?.visible).toBe(true)
    expect(parts.find((part) => part.text === 'sprites/logo')?.visible).toBe(true)
    parts.find((part) => part.text === 'start')!.emit('pointerdown')
    input.emit('pointerdown', { button: 0 })
    for (let i = 0; i < 60; i++) scene.update()
    expect(parts[0].tilePositionX).toBeGreaterThan(0)
    expect(parts.slice(6, 9).every((part) => !part.visible)).toBe(true)
    expect(start).not.toHaveBeenCalled()
    expect(speak).not.toHaveBeenCalled()
    expect(world).toEqual(before)
  })

  it.each(['ENTER', 'E', 'SPACE', 'Z'])(
    'starts with %s and fades only the title before the first line',
    (key) => {
      const { scene, parts, keys, time, start, input } = intro(true)
      const layer = parts.at(-1)!
      const crew = parts[5]
      const boat = parts.find((part) => part.text === 'sprites/boat')!
      const mich = parts.find((part) => part.text === 'sprites/mich')!
      const player = parts.find((part) => part.text === 'sprites/player')!
      const orb = parts.find((part) => part.text === 'sprites/orb')!
      expect([boat.y, mich.y, player.y, orb.y]).toEqual([272, 263, 263, 263])
      expect([boat.x, mich.x, player.x, orb.x]).toEqual([440, 440, 485, 464])
      keys[key].down = true
      scene.update()
      const label = key === 'ENTER' ? 'Enter' : key === 'SPACE' ? 'Space' : key
      expect(settings.confirmLabel).toBe(label)
      expect(layer.alpha).toBe(1)
      time.now = 1100
      keys.E.down = true
      input.emit('pointerdown')
      scene.update()
      expect(layer.alpha).toBeCloseTo(0.5)
      expect([boat.y, mich.y, player.y, orb.y]).toEqual([240, 231, 231, 231])
      expect([boat.x, mich.x, player.x, orb.x]).toEqual([356, 356, 401, 380])
      expect(crew.alpha).toBe(1)
      expect(speak).not.toHaveBeenCalled()
      expect(parts[8].text).toBe('')
      time.now = 2099
      scene.update()
      expect(layer.destroy).not.toHaveBeenCalled()
      time.now = 2100
      keys.ENTER.down = true
      scene.update()
      expect(layer.destroy).toHaveBeenCalledOnce()
      expect([boat.y, mich.y, player.y, orb.y]).toEqual([208, 199, 199, 199])
      expect([boat.x, mich.x, player.x, orb.x]).toEqual([272, 272, 317, 296])
      expect(parts.slice(6, 9).every((part) => part.visible)).toBe(true)
      expect(parts[7].text).toBe('Mich')
      expect(parts[8].text).toBe('')
      expect(start).not.toHaveBeenCalled()
      time.now = 2142
      scene.update()
      expect(settings.confirmLabel).toBe(label) // later E/Enter presses cannot replace the Start choice
      expect(speak).toHaveBeenCalledExactlyOnceWith(
        scene,
        'Mich',
        '[PLACEHOLDER first line]',
        0,
        expect.any(Number),
        expect.any(Object),
      )
    },
  )

  it('opens settings from the title with keys, ignoring clicks while the water keeps moving', () => {
    const { scene, parts, keys, launch } = intro(true)
    keys.DOWN.down = true
    keys.ENTER.down = true
    scene.update()
    expect(launch).toHaveBeenCalledWith('settings', { title: true })
    const x = parts[0].tilePositionX
    scene.update()
    expect(parts[0].tilePositionX).toBeGreaterThan(x)
    expect(speak).not.toHaveBeenCalled()
    settings.open = false
    const other = intro(true)
    other.parts.find((part) => part.text === 'settings')!.emit('pointerdown')
    other.input.emit('pointerdown', { button: 0 })
    other.scene.update()
    expect(other.launch).not.toHaveBeenCalled()
  })

  it('opens settings instead of skipping the intro and preserves typing time on resume', () => {
    const { scene, keys, launch, events, time, parts } = intro(false)
    keys.ESC.down = true
    scene.update()
    expect(launch).toHaveBeenCalledWith('settings', { title: false })
    events.emit('settings-resume', 10000)
    settings.open = false
    time.now += 10000
    scene.update()
    expect(parts[8].text).toBe('')
  })

  it('previews dialogue immediately when the title is skipped', () => {
    const { parts } = intro(false)
    expect(parts.some((part) => part.text === 'sprites/logo')).toBe(false)
    expect(parts[7].text).toBe('Mich')
    expect(parts[8].visible).toBe(true)
    expect(parts.find((p) => p.text === 'sprites/player')!.setFrame).toHaveBeenLastCalledWith(5)
    expect(parts.find((part) => part.text === 'sprites/orb')).toMatchObject({ x: 296, y: 199 })
  })

  it.each([true, false])('starts the island after the final fade with title=%s', (title) => {
    const { scene, keys, time, camera, cameras, start, events, tweens, parts } = intro(title)
    if (title) {
      keys.ENTER.down = true
      scene.update()
      time.now = 2100
      scene.update()
    }
    start.mockImplementation(() => events.emit('shutdown'))
    time.now = 5000
    keys.E.down = true
    scene.update()
    tweens.add.mock.calls.at(-1)![0].onComplete!()
    expect(camera.fadeOut).toHaveBeenCalledWith(400)
    expect(parts.find((p) => p.text === 'sprites/player')!.setFrame).toHaveBeenLastCalledWith(9)
    expect(() => camera.emit('camerafadeoutcomplete')).not.toThrow()
    expect(cameras.main).toBeUndefined()
    expect(start).toHaveBeenCalledExactlyOnceWith('island', { crash: true })
  })
})
