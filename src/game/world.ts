// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'sand' | 'grass'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Item = 'stone'

export interface World {
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  width: number
  height: number
  tiles: Tile[] // row-major, index = y * width + x
  player: { x: number; y: number; facing: Dir; cooldown: number }
  inventory: Partial<Record<Item, number>>
  tidepools: { x: number; y: number; stone: boolean; nextAt: number }[]
  npcs: { id: string; x: number; y: number; dialogue: string }[]
  flags: Record<string, boolean | number>
  dialogue: null | { npc: string; node: string; choice: number }
}

export type Action =
  { type: 'tick'; dt: number } | { type: 'move'; dir: Dir } | { type: 'interact' }

export interface Dialogue {
  name: string
  start: { when?: string; node: string }[] // first entry whose flag is truthy (or that has no `when`) wins
  nodes: Record<string, DialogueNode>
}
export interface DialogueNode {
  text: string
  set?: Record<string, boolean | number>
  next?: string | null // used when there are no choices; null or missing closes the dialogue
  choices?: { text: string; next: string | null; set?: Record<string, boolean | number> }[]
}

export interface Content {
  dialogues: Record<string, Dialogue>
}

export const DIRS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

export function tileAt(w: World, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return undefined
  return w.tiles[y * w.width + x]
}

export function createWorld(): World {
  const width = 32
  const height = 32
  const tiles: Tile[] = Array(width * height).fill('water')
  for (let y = 14; y <= 18; y++)
    for (let x = 14; x <= 18; x++)
      tiles[y * width + x] = x === 14 || x === 18 || y === 14 || y === 18 ? 'sand' : 'grass'
  return {
    rev: 0,
    time: 0,
    width,
    height,
    tiles,
    player: { x: 16, y: 16, facing: 'down', cooldown: 0 },
    inventory: {},
    tidepools: [{ x: 14, y: 14, stone: false, nextAt: 3000 }],
    npcs: [{ id: 'npc1', x: 18, y: 15, dialogue: 'npc1' }],
    flags: {},
    dialogue: null,
  }
}
