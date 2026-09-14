import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { apply } from '../game/actions'
import { choices } from '../game/throw'
import { createWorld, tileAt, tileIndex, type Content, type Dialogue } from '../game/world'
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
  it('starts the good ending with both gifts and reaches the reconciliation', () => {
    const { options } = menu(['island', 'ui'])
    options.find((option) => option.label === 'good ending: both gifts')!.run()
    expect(world.inventory).toMatchObject({ electrolytes: 1, glassi: 1 })
    expect(world.flags['ate:electrolytes']).toBeUndefined()
    expect(world.flags['had:glassi']).toBe(true)
    expect(world.flags['seahorse:peace']).toBeUndefined()
    expect(world.flags['etarp:i']).toBeUndefined()
    const content: Content = {
      dialogues: Object.fromEntries(
        ['seahorse', 'cannon', 'tarq'].map((key) => [
          key,
          JSON.parse(
            readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
          ),
        ]),
      ),
      items: {},
    }
    for (let i = 0; i < 2000 && world.dialogue?.key !== 'tarq'; i++) {
      const d = world.dialogue
      if (d && content.dialogues[d.key].nodes[d.node].text !== undefined && !world.closeup?.auto)
        apply(world, { type: 'interact' }, content)
      else apply(world, { type: 'tick', dt: 100 }, content)
      expect(world.objects.some((o) => o.kind === 'cannon' && o.firing)).toBe(false)
    }
    expect(world.dialogue?.key).toBe('tarq')
    expect(world.flags['seahorse:peace']).toBe(true)
    expect(world.flags['etarp:peace']).toBe(true)
    expect(world.flags['etarp:i']).toBe(true)
    expect(world.inventory.electrolytes).toBeUndefined()
    expect(world.inventory.glassi).toBeUndefined()
    expect(world.objects.find((o) => o.id === 'etarp')).toMatchObject({ ride: 'seahorse' })
  })

  it.each([
    'fifteen beauty',
    'fifteen beauty: saved electrolytes',
    'good ending: both gifts',
    "etarp's cannon",
    'tarq flies in',
    'leaving the island',
    'leaving with etarip',
  ])('stocks two visible home-island chairs and leaves the note chest closed for %s', (label) => {
    const { options } = menu(['island', 'ui'])
    options.find((option) => option.label === label)!.run()
    const chairs = world.objects.filter((o) => o.kind === 'chair')
    expect(chairs).toHaveLength(2)
    for (const chair of chairs) {
      expect(chair.hidden).toBeFalsy()
      expect(world.main[tileIndex(world, chair.x, chair.y)]).toBe(true)
      expect(['sand', 'grass', 'salt']).toContain(tileAt(world, chair.x, chair.y))
      expect(world.objects.filter((o) => o.x === chair.x && o.y === chair.y)).toHaveLength(1)
    }
    expect(world.objects.find((o) => o.id === 'crate3')).toMatchObject({
      open: false,
      dialogue: 'note',
    })
    const dialogue: Dialogue = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/tarq.json', import.meta.url), 'utf8'),
    )
    const offered = choices(world, dialogue.nodes.pick, dialogue)
    expect(offered.filter((c) => c.next === 'chair').map((c) => c.object)).toEqual(
      chairs.map((o) => o.id),
    )
    expect(offered.every((c) => world.objects.some((o) => o.id === c.object))).toBe(true)
  })

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
