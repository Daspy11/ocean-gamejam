import { MAPS } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Item = 'salt' | 'orb'
export const ITEMS: Item[] = ['salt', 'orb'] // icon frame order in sprites/items

// Things standing on the ground. x,y is the top-left tile of the footprint (see KINDS). Sprites come
// from sheet `sprites/<kind>` (npcs: `sprites/<sprite>`) and are drawn bottom-anchored, so tall
// objects overlap the tiles behind.
export type Obj = { id: string; x: number; y: number } & (
  | { kind: 'npc'; sprite: string; facing: Dir; dialogue: string }
  | { kind: 'orb'; doneAt: number } // thrown into the sea it boils its tile into salt once w.time reaches doneAt
  | { kind: 'tree' }
  | { kind: 'hut' }
  | { kind: 'boat' }
  | { kind: 'crate'; open: boolean }
)

export const KINDS: Record<Obj['kind'], { w: number; h: number; solid: boolean }> = {
  npc: { w: 1, h: 1, solid: true },
  orb: { w: 1, h: 1, solid: true },
  tree: { w: 1, h: 1, solid: true },
  hut: { w: 2, h: 2, solid: true },
  boat: { w: 2, h: 1, solid: true },
  crate: { w: 1, h: 1, solid: true },
}

export interface World {
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  width: number
  height: number
  tiles: Tile[] // row-major, index = y * width + x
  player: {
    x: number
    y: number
    facing: Dir
    step: null | { x: number; y: number; t: number } // tile being walked to and progress 0..1
    held: Dir | null // direction currently held on the controller
    run: boolean
    turnedAt: number // sim time facing last changed while standing; walking waits 100ms after a turn
    parity: boolean // flips every step so the walk cycle alternates feet
  }
  inventory: Partial<Record<Item, number>>
  objects: Obj[]
  // story state. Strings let dialogue rename things: flags['name:orb'] overrides the item's display name
  flags: Record<string, boolean | number | string>
  dialogue: null | { key: string; node: string; choice: number; item?: Item } // item fills {item} in text
  queue: { key: string; item?: Item }[] // dialogues waiting for the open one to close, in order
  menu: null | { screen: 'inventory'; cursor: number }
}

export type Action =
  | { type: 'tick'; dt: number }
  | { type: 'move'; dir: Dir | null; run?: boolean } // the held direction changed; null = released
  | { type: 'interact' }
  | { type: 'talk'; key: string } // open a dialogue by key (scripted scenes; npcs go through interact)
  | { type: 'menu' } // toggle the inventory screen

export interface Dialogue {
  name: string
  // plays once, when the sim emits `event` and flag `when` (if given) is truthy; sets flags['fired:<key>'].
  // events: crate:open · menu:close · salt:spawn
  trigger?: { event: string; when?: string }
  start: { when?: string; node: string }[] // first entry whose flag is truthy (or that has no `when`) wins
  nodes: Record<string, DialogueNode>
}
export interface DialogueNode {
  text: string // may contain {item}, replaced with the display name of dialogue.item
  who?: string // speaker name for this node; absent = the dialogue's name, '' = no name line
  set?: Record<string, boolean | number | string>
  next?: string | null // used when there are no choices; null or missing closes the dialogue
  choices?: { text: string; next: string | null; set?: Record<string, boolean | number | string> }[]
}

export interface Content {
  dialogues: Record<string, Dialogue>
  items: Partial<Record<Item, { name: string }>>
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

export function objectAt(w: World, x: number, y: number): Obj | undefined {
  return w.objects.find((o) => {
    const k = KINDS[o.kind]
    return x >= o.x && x < o.x + k.w && y >= o.y && y < o.y + k.h
  })
}

export function createWorld(map: keyof typeof MAPS = 'island'): World {
  const width = 32
  const height = 32
  const rows = MAPS[map]
  if (rows.length !== height || rows.some((row) => row.length !== width))
    throw new Error(`map.ts ${map} must be 32 rows of 32 characters`)
  const glyph: Record<string, Tile> = { '~': 'water', s: 'salt', '.': 'sand', '#': 'grass' }
  const tiles = rows.flatMap((row) => [...row].map((ch) => glyph[ch]))
  // island: the intro ends with the boat crashing into the west shore, so that is where everyone
  // starts. gallery: the middle of the object pad, facing the camera.
  const spawn: { x: number; y: number; facing: Dir } =
    map === 'gallery' ? { x: 8, y: 20, facing: 'down' } : { x: 14, y: 16, facing: 'right' }
  const objects: Obj[] =
    map === 'gallery'
      ? [
          { id: 'g-tree', kind: 'tree', x: 2, y: 18 },
          { id: 'g-hut', kind: 'hut', x: 4, y: 17 },
          { id: 'g-boat', kind: 'boat', x: 7, y: 18 },
          { id: 'g-crate', kind: 'crate', x: 2, y: 20, open: false },
          { id: 'g-crate-open', kind: 'crate', x: 4, y: 20, open: true },
          {
            id: 'g-mich',
            kind: 'npc',
            sprite: 'mich',
            x: 6,
            y: 20,
            facing: 'down',
            dialogue: 'mich',
          },
          // a day of sim time away, so this one keeps smoking however long the gallery is left open
          { id: 'g-orb', kind: 'orb', x: 12, y: 18, doneAt: 86400000 },
          { id: 'g-orb-salt', kind: 'orb', x: 12, y: 20, doneAt: 0 }, // already sat on its finished salt
        ]
      : [
          { id: 'boat1', kind: 'boat', x: 12, y: 16 },
          { id: 'crate1', kind: 'crate', x: 13, y: 17, open: false },
          {
            id: 'mich',
            kind: 'npc',
            sprite: 'mich',
            x: 13,
            y: 15,
            facing: 'right',
            dialogue: 'mich',
          },
          { id: 'tree1', kind: 'tree', x: 15, y: 14 },
          { id: 'hut1', kind: 'hut', x: 17, y: 17 },
        ]
  return {
    rev: 0,
    time: 0,
    width,
    height,
    tiles,
    player: { ...spawn, step: null, held: null, run: false, turnedAt: 0, parity: false },
    inventory: {},
    objects,
    flags: {},
    dialogue: null,
    queue: [],
    menu: null,
  }
}
