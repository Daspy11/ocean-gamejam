import { apply } from './game/actions'
import { createWorld, type Action, type Content, type World } from './game/world'
import type { VOICES } from './scenes/speech'

export let world = createWorld()
export let content: Content = { dialogues: {}, items: {} }
// Preferences survive new games; opening settings freezes dispatch as well as the scene stack.
export const settings = { open: false, music: true, sfx: true, confirmLabel: 'E' }
try {
  const saved = JSON.parse(localStorage.getItem('boatiful-settings') ?? '{}')
  if (typeof saved.music === 'boolean') settings.music = saved.music
  if (typeof saved.sfx === 'boolean') settings.sfx = saved.sfx
} catch {
  /* Storage can be unavailable in an embedded/private browser. */
}

export function dispatch(a: Action) {
  if (!settings.open) apply(world, a, content)
}

export function load(w: World) {
  const inventory: Record<string, string> = {
    A: 'Y',
    Cross: 'Triangle',
    B: 'X',
    'Bottom button': 'top button',
  }
  w.controls = {
    confirm: settings.confirmLabel,
    inventory: inventory[settings.confirmLabel] ?? 'I',
  }
  w.rev = world.rev + 1 // force a resync: every scene redraws when rev moves
  world = w
}

export function setContent(c: Content) {
  content = c
}

export interface IslandApi {
  world: () => World // structuredClone snapshot
  dispatch: (a: Action) => void
  load: (w: World) => void
  content: () => Content
  game: Phaser.Game
  voices: typeof VOICES
  voice: (who: string) => void // audition a speaker without advancing the game
}

declare global {
  interface Window {
    island: IslandApi
  }
}
