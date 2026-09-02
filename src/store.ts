import { apply } from './game/actions'
import { createWorld, type Action, type Content, type World } from './game/world'

export let world = createWorld()
export let content: Content = { dialogues: {}, items: {} }

export function dispatch(a: Action) {
  apply(world, a, content)
}

export function load(w: World) {
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
}

declare global {
  interface Window {
    island: IslandApi
  }
}
