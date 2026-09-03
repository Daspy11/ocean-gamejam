import { MAPS } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Item = 'salt' | 'orb' | 'electrolytes'
export const ITEMS: Item[] = ['salt', 'orb', 'electrolytes'] // icon frame order in sprites/items

// Things standing on the ground. x,y is the top-left tile of the footprint (see KINDS). Sprites come
// from sheet `sprites/<kind>` (npcs: `sprites/<sprite>`) and are drawn bottom-anchored, so tall
// objects overlap the tiles behind.
export type Obj = { id: string; x: number; y: number } &
  // a cutscene walks an npc along `path`, one tile per step exactly like the player
  (
    | {
        kind: 'npc'
        sprite: string
        facing: Dir
        dialogue: string
        step?: null | { x: number; y: number; t: number }
        path?: Dir[]
        run?: boolean
        parity?: boolean
      }
    | { kind: 'orb'; doneAt: number } // thrown into the sea it boils its tile into salt once w.time reaches doneAt
    | { kind: 'tree' }
    | { kind: 'hut' }
    | { kind: 'boat' }
    | { kind: 'crate'; open: boolean; item: Item } // `item` is what opening it hands over, once
    // planted by a cutscene: blooming starts at bloomAt, and 1500 ms later it is white and worth 10 beauty
    | { kind: 'flower'; bloomAt?: number; white?: boolean }
  )

export const KINDS: Record<Obj['kind'], { w: number; h: number; solid: boolean }> = {
  npc: { w: 1, h: 1, solid: true },
  orb: { w: 1, h: 1, solid: true },
  tree: { w: 1, h: 1, solid: true },
  hut: { w: 2, h: 2, solid: true },
  boat: { w: 2, h: 1, solid: true },
  crate: { w: 1, h: 1, solid: true },
  flower: { w: 1, h: 1, solid: true },
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
  score: number // beauty; hidden until flags['score:on']
  pops: { x: number; y: number; text: string; at: number }[] // floating score text over tile x,y, gone 1500 ms after `at`
  objects: Obj[]
  // story state. Strings let dialogue rename things: flags['name:orb'] overrides the item's display name
  flags: Record<string, boolean | number | string>
  // item fills {item} in text; until is the sim time a `wait` act on the open node ends
  dialogue: null | { key: string; node: string; choice: number; item?: Item; until?: number }
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
  // events: crate:open · menu:close · salt:spawn · talk:<npc id>
  trigger?: { event: string; when?: string }
  start: { when?: string; node: string }[] // first entry whose flag is truthy (or that has no `when`) wins
  nodes: Record<string, DialogueNode>
}
export interface DialogueNode {
  text?: string // may contain {item}, replaced with the display name of dialogue.item
  who?: string // speaker name for this node; absent = the dialogue's name, '' = no name line
  // A node without text is an act: the box hides, the act runs, and the node advances to `next` by
  // itself once it is done (walk: the npc has arrived; wait: the time has passed; spawn: at once).
  // Interact and move are ignored while an act runs.
  walk?: { id: string; path: Dir[]; run?: boolean }
  wait?: number // ms
  spawn?: Obj
  bloom?: string // id of a flower: it starts blooming here, and the act is over once it has gone white
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
          { id: 'g-crate', kind: 'crate', x: 2, y: 20, open: false, item: 'orb' },
          { id: 'g-crate-open', kind: 'crate', x: 4, y: 20, open: true, item: 'orb' },
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
          // 8,18 is under g-boat's 2x1 footprint, so Walter stands in the next free slot along
          {
            id: 'g-walter',
            kind: 'npc',
            sprite: 'walter',
            x: 9,
            y: 18,
            facing: 'down',
            dialogue: 'walter',
          },
          { id: 'g-flower', kind: 'flower', x: 9, y: 20, white: false },
          { id: 'g-flower-white', kind: 'flower', x: 10, y: 20, white: true },
        ]
      : [
          { id: 'boat1', kind: 'boat', x: 12, y: 16 },
          { id: 'crate1', kind: 'crate', x: 13, y: 17, open: false, item: 'orb' },
          // the second crate, up on the north-east sand
          { id: 'crate2', kind: 'crate', x: 19, y: 14, open: false, item: 'electrolytes' },
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
    score: 0,
    pops: [],
    objects,
    flags: {},
    dialogue: null,
    queue: [],
    menu: null,
  }
}
