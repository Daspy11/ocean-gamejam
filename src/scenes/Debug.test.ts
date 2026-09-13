import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createWorld } from '../game/world'
import { load, world } from '../store'
import Debug from './Debug'
import Intro from './Intro'
import UI from './UI'
import { speak, stopSpeech } from './speech'

vi.mock('phaser', () => ({
  default: {
    Scene: vi.fn(),
    Input: {
      Keyboard: {
        JustDown: (key?: { down: boolean }) => {
          const down = key?.down ?? false
          if (key) key.down = false
          return down
        },
      },
    },
  },
}))
vi.mock('./speech', () => ({ background: vi.fn(), speak: vi.fn(), stopSpeech: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function menu(running: string[]) {
  vi.stubGlobal('location', { search: '' })
  load(createWorld())
  const active = new Set([...running, 'debug'])
  const paused = new Set<string>()
  const events = new EventEmitter()
  const queue: (() => void)[] = []
  const text = { setOrigin: vi.fn().mockReturnThis(), setText: vi.fn().mockReturnThis() }
  const debug = new Debug()
  const scene = {
    manager: {
      getScenes: () => [
        ...['intro', 'island', 'cave', 'ui', 'outro'].map((key) => ({
          sys: { settings: { key }, isActive: () => active.has(key) },
        })),
        debug,
      ],
    },
    pause: (key: string) =>
      queue.push(() => {
        active.delete(key)
        paused.add(key)
      }),
    resume: vi.fn((key: string) =>
      queue.push(() => {
        paused.delete(key)
        active.add(key)
      }),
    ),
    stop: (key = 'debug') =>
      queue.push(() => {
        active.delete(key)
        paused.delete(key)
        if (key === 'debug') events.emit('shutdown')
      }),
    launch: (key: string) =>
      queue.push(() => {
        active.add(key)
        if (key === 'island') active.add('ui')
      }),
  }
  Object.assign(debug, {
    events,
    add: { nineslice: () => text, bitmapText: () => text },
    input: { keyboard: { addKeys: () => ({}) } },
    scene,
  })
  debug.create()
  const flush = () => {
    while (queue.length) queue.shift()!()
  }
  flush()
  const options = (debug as unknown as { options: { label: string; run: () => void }[] }).options
  return { debug, active, paused, scene, flush, options }
}

describe('debug story jumps', () => {
  it.each([Intro, UI])('silences %s on pause and removes its audio hook on shutdown', (Scene) => {
    load(createWorld())
    const scene = new Scene()
    const events = new EventEmitter()
    const picture: Record<string, unknown> = { x: 0, y: 0, height: 16 }
    for (const method of [
      'setOrigin',
      'setScale',
      'setFrame',
      'setTileScale',
      'setText',
      'setSize',
      'setY',
      'setVisible',
      'setTintFill',
      'setDropShadow',
      'setMaxWidth',
    ])
      picture[method] = vi.fn().mockReturnValue(picture)
    picture.getTextBounds = () => ({ wrappedText: '[PLACEHOLDER line]' })
    Object.assign(scene, {
      events,
      add: Object.fromEntries(
        [
          'tileSprite',
          'image',
          'container',
          'bitmapText',
          'nineslice',
          'rectangle',
          'graphics',
        ].map((method) => [method, () => picture]),
      ),
      cache: {
        json: { get: () => ({ cast: {}, lines: [{ who: '', text: '[PLACEHOLDER line]' }] }) },
      },
      tweens: { add: vi.fn() },
      cameras: { main: { clearMask: vi.fn() } },
      input: { on: vi.fn(), off: vi.fn(), keyboard: { addKeys: () => ({}) } },
      time: { now: 0 },
    })
    scene.create()
    vi.mocked(stopSpeech).mockClear()
    events.emit('pause')
    expect(stopSpeech).toHaveBeenCalledOnce()
    events.emit('shutdown')
    expect(stopSpeech).toHaveBeenCalledTimes(2)
    expect(events.listenerCount('pause')).toBe(0)
    scene.create()
    expect(events.listenerCount('pause')).toBe(1)
  })

  it('stops the hidden intro so gameplay cannot trigger another Mich sample', () => {
    const { active, scene, flush, options } = menu(['intro'])
    const key = { down: false }
    const text = {
      height: 16,
      setOrigin: vi.fn().mockReturnThis(),
      setText: vi.fn().mockReturnThis(),
      setY: vi.fn().mockReturnThis(),
      setSize: vi.fn().mockReturnThis(),
      getTextBounds: () => ({ wrappedText: '[PLACEHOLDER line]' }),
    }
    const intro = new Intro()
    Object.assign(intro, {
      water: { tilePositionX: 0 },
      script: {
        cast: { mich: { name: 'Mich' } },
        lines: Array.from({ length: 2 }, () => ({ who: 'mich', text: '[PLACEHOLDER line]' })),
      },
      complete: true,
      keys: { E: key },
      time: { now: 0 },
      body: text,
      who: text,
      box: text,
      actors: {},
    })
    options.find((option) => option.label === 'beauty is on')!.run()
    scene.stop()
    flush()
    expect(world.flags['score:on']).toBe(true)
    expect(active.has('island')).toBe(true)
    // The same E press used to dismiss gameplay dialogue also reaches a hidden intro.
    key.down = true
    if (active.has('intro')) intro.update()
    intro.time.now = 42
    if (active.has('intro')) intro.update()
    expect(speak).not.toHaveBeenCalled()
    expect(active.has('intro')).toBe(false)
  })

  it.each([['intro'], ['island', 'ui'], ['cave', 'ui'], ['island', 'ui', 'outro']])(
    'pauses and restores the actual scene stack on cancel: %j',
    (...running) => {
      const { active, paused, scene, flush } = menu(running)
      expect([...active]).toEqual(['debug'])
      expect([...paused]).toEqual(running)
      scene.stop()
      flush()
      expect([...active]).toEqual(running)
      expect(paused.size).toBe(0)
    },
  )

  it.each([
    ['intro'],
    ['island', 'ui'],
    ['cave', 'ui'],
    ['island', 'ui', 'outro'],
    ['intro', 'island', 'ui'],
  ])('replaces the whole stack without resuming old scenes on a jump: %j', (...running) => {
    const { active, paused, scene, flush, options } = menu(running)
    options.find((option) => option.label === 'beauty is on')!.run()
    scene.stop()
    flush()
    expect([...active]).toEqual(['island', 'ui'])
    expect(paused.size).toBe(0)
    expect(scene.resume).not.toHaveBeenCalled()
    expect(world.dialogue).toBeNull()
    expect(world.typing).toBeUndefined()
  })
})
