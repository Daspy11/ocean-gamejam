import type Phaser from 'phaser'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindControls, KEYS } from './Settings'

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
afterEach(() => vi.unstubAllGlobals())

function controls() {
  const keys = Object.fromEntries(
    KEYS.split(',').map((key) => [key, { down: false, isDown: false, timeDown: 0 }]),
  )
  const input = Object.assign(new EventEmitter(), { keyboard: { addKeys: () => keys } })
  const events = new EventEmitter()
  const pad = {
    id: 'Xbox Controller',
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  }
  const pads = [pad]
  vi.stubGlobal('navigator', { getGamepads: () => pads })
  const read = bindControls({ input, events } as unknown as Phaser.Scene)
  read()
  return { read, keys, pad, pads, input, events }
}

describe('shared controls', () => {
  it('ignores OS repeat after resuming and tolerates blocked gamepad access', () => {
    const { read, keys } = controls()
    Object.assign(keys.ESC, { down: true, originalEvent: { repeat: true } })
    vi.stubGlobal('navigator', {
      getGamepads: () => {
        throw new Error('permission denied')
      },
    })
    expect(read().settings).toBe(false)
    keys.ENTER.down = true
    expect(read()).toMatchObject({ confirm: true, confirmLabel: 'Enter' })
  })
  it.each(['ENTER', 'E', 'SPACE', 'Z'])('confirms once with %s', (key) => {
    const { read, keys } = controls()
    keys[key].down = true
    expect(read()).toMatchObject({
      confirm: true,
      confirmLabel: key === 'ENTER' ? 'Enter' : key === 'SPACE' ? 'Space' : key,
    })
    expect(read().confirm).toBe(false)
  })

  it.each([
    ['Xbox Controller', 'A'],
    ['Wireless Controller (Vendor: 054c Product: 0ce6)', 'Cross'],
    ['Nintendo Switch Pro Controller', 'B'],
    ['Unknown standard controller', 'Bottom button'],
  ])('labels the start button for %s', (id, label) => {
    const { read, pad } = controls()
    pad.id = id
    pad.buttons[0].pressed = true
    expect(read()).toMatchObject({ confirm: true, confirmLabel: label })
    expect(read().confirmLabel).toBeUndefined()
  })

  it.each(['ESC', 'X', 'C'])('toggles settings with %s', (key) => {
    const { read, keys } = controls()
    keys[key].down = true
    expect(read()).toMatchObject({ confirm: false, settings: true, inventory: false })
    expect(read().settings).toBe(false)
  })

  it('coalesces aliases and maps mouse buttons without repeating a click', () => {
    const { read, keys, input } = controls()
    keys.ENTER.down = keys.Z.down = true
    input.emit('pointerdown', { button: 0 })
    expect(read().confirm).toBe(true)
    expect(read().confirm).toBe(false)
    input.emit('pointerdown', { button: 2 })
    expect(read()).toMatchObject({ confirm: false, settings: true })
    input.emit('pointerdown', { button: 1 })
    expect(read().confirm).toBe(false)
  })

  it('only confirms clicks when allowed and discards clicks outside dialogue', () => {
    const { read, keys, input } = controls()
    input.emit('pointerdown', { button: 0 })
    expect(read(false).confirm).toBe(false)
    expect(read(true).confirm).toBe(false)
    input.emit('pointerdown', { button: 0 })
    expect(read(true).confirm).toBe(true)
    expect(read(true).confirm).toBe(false)
    keys.E.down = true
    expect(read(false).confirm).toBe(true)
  })

  it.each([
    [0, 'confirm'],
    [1, 'settings'],
    [9, 'settings'],
    [3, 'inventory'],
  ] as const)('maps gamepad button %s to %s on press, never while held', (button, action) => {
    const { read, pad } = controls()
    pad.buttons[button].pressed = true
    expect(read()[action]).toBe(true)
    expect(read()[action]).toBe(false)
    pad.buttons[button].pressed = false
    read()
    pad.buttons[button].pressed = true
    expect(read()[action]).toBe(true)
  })

  it('uses a stick deadzone and dominant axis, supports D-pad/run, and clears on disconnect', () => {
    const { read, pad, pads } = controls()
    pad.axes = [0.1, -0.2]
    expect(read().dir).toBeNull()
    pad.axes = [0.6, -0.9]
    pad.buttons[7].pressed = true
    expect(read()).toMatchObject({ dir: 'up', up: true, run: true })
    expect(read().up).toBe(false)
    pad.axes = [0, 0]
    pad.buttons[13].pressed = true
    expect(read()).toMatchObject({ dir: 'down', down: true })
    pads.length = 0
    expect(read()).toMatchObject({ dir: null, run: false })
    pads.push(pad)
    expect(read().dir).toBe('down')
  })

  it('keeps latest-key movement and inventory/run aliases', () => {
    const { read, keys } = controls()
    Object.assign(keys.W, { isDown: true, timeDown: 5 })
    Object.assign(keys.D, { isDown: true, timeDown: 10 })
    keys.SHIFT.isDown = true
    keys.I.down = true
    expect(read()).toMatchObject({ dir: 'right', run: true, inventory: true })
    keys.D.isDown = false
    keys.TAB.down = true
    expect(read()).toMatchObject({ dir: 'up', inventory: true })
  })

  it('discards menu-closing input on resume, including a held controller button', () => {
    const { read, keys, input, events, pad } = controls()
    keys.ENTER.down = true
    input.emit('pointerdown', { button: 0 })
    pad.buttons[0].pressed = true
    events.emit('controls-reset')
    expect(read().confirm).toBe(false)
    expect(read().confirm).toBe(false)
    pad.buttons[0].pressed = false
    read()
    pad.buttons[0].pressed = true
    expect(read().confirm).toBe(true)
    events.emit('shutdown')
    expect(input.listenerCount('pointerdown')).toBe(0)
    expect(events.listenerCount('resume')).toBe(0)
  })
})
