import { afterEach, expect, it } from 'vitest'
import { createWorld } from './game/world'
import { dispatch, load, settings, world } from './store'

afterEach(() => {
  settings.open = false
  settings.confirmLabel = 'E'
})

it.each([
  ['Enter', 'I'],
  ['A', 'Y'],
  ['Cross', 'Triangle'],
  ['B', 'X'],
  ['Bottom button', 'top button'],
])('keeps inventory hints consistent with a %s start across world loads', (confirm, inventory) => {
  settings.confirmLabel = confirm
  load(createWorld())
  expect(world.controls).toEqual({ confirm, inventory })
  load(createWorld())
  expect(world.controls).toEqual({ confirm, inventory })
})

it('freezes every game action during settings and resumes the same world afterwards', () => {
  load(createWorld())
  dispatch({ type: 'move', dir: 'left' })
  settings.open = true
  const before = structuredClone(world)
  for (const action of [
    { type: 'tick', dt: 10000 },
    { type: 'confirm' },
    { type: 'menu' },
    { type: 'move', dir: 'right' },
    { type: 'talk', key: 'mich' },
  ] as const)
    dispatch(action)
  expect(world).toEqual(before)
  settings.open = false
  dispatch({ type: 'tick', dt: 16 })
  expect(world.time).toBe(before.time + 16)
})

it('keeps music and sfx preferences independent across a new game', () => {
  settings.music = false
  settings.sfx = true
  load(createWorld())
  expect(settings).toEqual({ open: false, music: false, sfx: true, confirmLabel: 'E' })
  settings.music = true
})
