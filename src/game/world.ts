import { MAPS } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass' | 'farm' | 'rock'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Item =
  | 'salt'
  | 'orb'
  | 'electrolytes'
  | 'twig'
  | 'seal'
  | 'egg'
  | 'hatrack'
  | 'carrot'
  | 'certificate'
  | 'carpet'
// icon frame order in sprites/items
export const ITEMS: Item[] = [
  'salt',
  'orb',
  'electrolytes',
  'twig',
  'seal',
  'egg',
  'hatrack',
  'carrot',
  'certificate',
  'carpet',
]

// Things standing on the ground. x,y is the top-left tile of the footprint (see KINDS). Sprites come
// from sheet `sprites/<kind>` (npcs: `sprites/<sprite>`) and are drawn bottom-anchored, so tall
// objects overlap the tiles behind.
export type Obj = {
  id: string
  x: number
  y: number
  // a cutscene walks any object along `path`, one tile per step exactly like the player: an npc on
  // foot, a boat under sail
  step?: null | { x: number; y: number; t: number }
  path?: Dir[]
  run?: boolean
  parity?: boolean
} & (
  | {
      kind: 'npc'
      sprite: string
      facing: Dir
      dialogue: string
      ride?: string // id of the object he stands on: he takes its tile and its step
    }
  // thrown into the sea it boils its tile into salt once w.time reaches doneAt; `thrown` is the
  // tile it left the hand on and when, so the scene can arc it over for the first 300 ms
  | { kind: 'orb'; doneAt: number; thrown?: { x: number; y: number; at: number } }
  // shaken for twigs; flyAt/landAt are when it started leaving / arriving, 1500 ms each
  // a tree with its own dialogue is talked to, not shaken
  | {
      kind: 'tree'
      dialogue?: string
      shakes?: number
      shookAt?: number
      flyAt?: number
      landAt?: number
    }
  | { kind: 'boat'; wrecked?: boolean } // wrecked: it sailed into something, so the bow is stove in
  | { kind: 'crate'; open: boolean; item: Item } // `item` is what opening it hands over, once
  | { kind: 'sign'; dialogue: string } // interact reads it: the text is a dialogue with no speaker
  // planted by a cutscene: blooming starts at bloomAt, and 1500 ms later it is white and worth 10 beauty
  | { kind: 'flower'; bloomAt?: number; white?: boolean }
  // walked onto rather than into, like a floor, but stepping on it puts the player down at `to`
  | { kind: 'cave'; to: { x: number; y: number } }
  | { kind: 'rack' } // interact carries the whole thing off, hats and all
  | { kind: 'carrot' } // one of the shrimp's crop: interact pulls it up and the tile is bare
  | { kind: 'fence' } // a post and rail of the ring round his field: nothing to do with it, just solid
  // the desalinator 9000, smoking away: it eats a beauty every 2 s and blows up after `left` of them
  | { kind: 'machine'; nextAt?: number; left: number }
  | { kind: 'floor' } // laid on the ground out of the bag: he walks over it, and it is worth 5 beauty
)

export const KINDS: Record<Obj['kind'], { w: number; h: number; solid: boolean }> = {
  npc: { w: 1, h: 1, solid: true },
  orb: { w: 1, h: 1, solid: true },
  tree: { w: 1, h: 1, solid: true },
  boat: { w: 2, h: 1, solid: true },
  crate: { w: 1, h: 1, solid: true },
  sign: { w: 1, h: 1, solid: true },
  flower: { w: 1, h: 1, solid: true },
  cave: { w: 1, h: 1, solid: false },
  rack: { w: 1, h: 1, solid: true },
  carrot: { w: 1, h: 1, solid: true },
  fence: { w: 1, h: 1, solid: true },
  machine: { w: 1, h: 1, solid: true },
  floor: { w: 1, h: 1, solid: false },
}

export interface World {
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  rumble: number // the sim time the screen shake ends; the scene jitters the camera until then
  width: number
  height: number
  tiles: Tile[] // row-major, index = y * width + x
  main: boolean[] // same indexing: the island the player washed up on, the only one beauty counts on
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
  score: number // beauty: -1 per salt block placed, +10 a bloomed flower; hidden until flags['score:on']
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

// one entry of a `start` or a branching `next`: it wins if its flag is set and the bag holds `has`
export type Branch = { when?: string; has?: Partial<Record<Item, number>>; node: string }

export interface Dialogue {
  name: string
  // plays once, when the sim emits `event` and flag `when` (if given) is truthy; sets flags['fired:<key>'].
  // events: crate:open · menu:close · salt:spawn · salt:place · salt:away (a block laid off the main
  // island) · talk:<npc id> · tree:shake:<n> · tree:near · score:negative (beauty has gone below
  // zero) · score:fifteen (beauty has first reached 15) · arrive:north (stepped ashore up north) ·
  // carrots:done (the last carrot pulled up)
  trigger?: { event: string; when?: string }
  start: Branch[] // first entry that matches wins
  nodes: Record<string, DialogueNode>
}
export interface DialogueNode {
  text?: string // may contain {item}, replaced with the display name of dialogue.item
  who?: string // speaker name for this node; absent = the dialogue's name, '' = no name line
  // A node without text is an act: the box hides, the act runs, and the node advances to `next` by
  // itself once it is done (walk: the npc has arrived; wait: the time has passed; spawn and shake:
  // at once; fly: the tree has gone; land: it has come down; rumble: the shake is over). Interact
  // and move are ignored while an act runs.
  walk?: { id: string; path: Dir[]; run?: boolean }
  wait?: number // ms
  rumble?: number // ms of screen shake, from now
  spawn?: Obj
  put?: { by: string; obj: Obj } // spawn, but on the nearest free ground beside `by`, his left first
  gone?: string // id of an object: the act runs until it is no longer in the world
  bloom?: string // id of a flower: it starts blooming here, and the act is over once it has gone white
  shake?: string // id of a tree: one more shake, and the twig it drops
  fly?: string // id of a tree: it lifts off and is gone 1500 ms later
  land?: string // id of a tree: it comes down out of the sky over 1500 ms
  // spends items as the node opens, one of an Item or the counts in a record; no got box
  take?: Item | Partial<Record<Item, number>>
  give?: Item // hands over one as the node opens: a crate's gain, got box and all, from a line
  set?: Record<string, boolean | number | string>
  // used when there are no choices; null or missing closes the dialogue. A list is read like `start`:
  // the first matching entry wins, and none matching closes it.
  next?: string | null | Branch[]
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

// beauty only counts on the main island, from the start; the floating pop waits for score:on
export function beauty(w: World, n: number, x: number, y: number): void {
  if (!w.main[y * w.width + x]) return
  w.score += n
  if (w.flags['score:on']) w.pops.push({ x, y, text: n > 0 ? `+${n}` : `${n}`, at: w.time })
}

export function objectAt(w: World, x: number, y: number): Obj | undefined {
  return w.objects.find((o) => {
    const k = KINDS[o.kind]
    return x >= o.x && x < o.x + k.w && y >= o.y && y < o.y + k.h
  })
}

// every npc in the two lists below: who he is, the sheet he is drawn from, where he stands and
// what he says
const npc = (
  id: string,
  sprite: string,
  x: number,
  y: number,
  facing: Dir,
  dialogue: string,
): Obj => ({ id, kind: 'npc', sprite, x, y, facing, dialogue })

export function createWorld(map: keyof typeof MAPS = 'island'): World {
  const rows = MAPS[map]
  const width = rows[0].length
  const height = rows.length
  if (rows.some((row) => row.length !== width))
    throw new Error(`map.ts ${map} must be rows of ${width} characters`)
  const glyph: Record<string, Tile> = {
    '~': 'water',
    s: 'salt',
    '.': 'sand',
    '#': 'grass',
    '^': 'rock',
    T: 'grass', // a tree stands on it: the tile itself is ordinary grass
    F: 'farm', // tilled soil with a carrot growing on it
    '=': 'grass', // grass with a fence post standing on it
  }
  const tiles = rows.flatMap((row) => [...row].map((ch) => glyph[ch]))
  // island: the intro ends with the boat crashing into the west shore, so that is where everyone
  // starts. gallery: the middle of the object pad, facing the camera.
  const spawn: { x: number; y: number; facing: Dir } =
    map === 'gallery' ? { x: 8, y: 20, facing: 'down' } : { x: 14, y: 16, facing: 'right' }
  // the main island is whatever land you can walk to from the spawn: every other island is out at
  // sea as far as beauty is concerned
  const main = tiles.map(() => false)
  const edge = [spawn.y * width + spawn.x]
  while (edge.length) {
    const at = edge.pop()!
    if (main[at] || tiles[at] === 'water') continue
    main[at] = true
    if (at % width > 0) edge.push(at - 1)
    if (at % width < width - 1) edge.push(at + 1)
    if (at >= width) edge.push(at - width)
    if (at + width < tiles.length) edge.push(at + width)
  }
  const objects: Obj[] =
    map === 'gallery'
      ? [
          { id: 'g-tree', kind: 'tree', x: 2, y: 18 },
          { id: 'g-boat', kind: 'boat', x: 7, y: 18 },
          { id: 'g-crate', kind: 'crate', x: 2, y: 20, open: false, item: 'orb' },
          { id: 'g-crate-open', kind: 'crate', x: 4, y: 20, open: true, item: 'orb' },
          npc('g-mich', 'mich', 6, 20, 'down', 'mich'),
          // a day of sim time away, so this one keeps smoking however long the gallery is left open
          { id: 'g-orb', kind: 'orb', x: 12, y: 18, doneAt: 86400000 },
          { id: 'g-orb-salt', kind: 'orb', x: 12, y: 20, doneAt: 0 }, // already sat on its finished salt
          // 8,18 is under g-boat's 2x1 footprint, so Walter stands in the next free slot along
          npc('g-walter', 'walter', 9, 18, 'down', 'walter'),
          { id: 'g-flower', kind: 'flower', x: 9, y: 20, white: false },
          { id: 'g-flower-white', kind: 'flower', x: 10, y: 20, white: true },
          { id: 'g-sign', kind: 'sign', x: 3, y: 20, dialogue: 'sign' },
          { id: 'g-fence', kind: 'fence', x: 2, y: 19 }, // two in a row, so the rail line reads
          { id: 'g-fence2', kind: 'fence', x: 3, y: 19 },
          // a day of sim time away, so the prototype keeps smoking rather than blowing up in here
          { id: 'g-machine', kind: 'machine', x: 5, y: 19, nextAt: 86400000, left: 10 },
          npc('g-seahorse', 'seahorse', 7, 19, 'down', 'seahorse'),
          { id: 'g-wreck', kind: 'boat', x: 5, y: 17, wrecked: true }, // the smashed hull frame
          // the pirate faces the way he is not looking, so this row draws his back
          npc('g-etarp', 'etarp', 4, 18, 'down', 'etarp'),
        ]
      : [
          { id: 'boat1', kind: 'boat', x: 12, y: 16 },
          { id: 'crate1', kind: 'crate', x: 13, y: 17, open: false, item: 'orb' },
          // the second crate, over on the far island: the reason to bridge the gap
          { id: 'crate2', kind: 'crate', x: 24, y: 17, open: false, item: 'electrolytes' },
          npc('mich', 'mich', 13, 15, 'right', 'mich'),
          { id: 'tree1', kind: 'tree', x: 16, y: 16 },
          { id: 'sign1', kind: 'sign', x: 25, y: 16, dialogue: 'sign' },
          // out on the big island, on the grass the forest leaves clear
          { id: 'crate3', kind: 'crate', x: 48, y: 22, open: false, item: 'seal' },
          npc('albatross', 'albatross', 36, 20, 'down', 'albatross'),
          // the mouth walled in by the forest, and the sand tile at the far end of the room
          { id: 'cave1', kind: 'cave', x: 42, y: 17, to: { x: 10, y: 40 } },
          { id: 'caveout', kind: 'cave', x: 10, y: 41, to: { x: 42, y: 18 } },
          { id: 'rack1', kind: 'rack', x: 10, y: 37 },
          // the farmer, sat on his stool right above the gate in his fence
          npc('shrimp', 'shrimp', 49, 13, 'down', 'shrimp'),
        ]
  // the forest and the carrot field are drawn in the map rather than listed: one object per glyph
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'T') objects.push({ id: `tree${x}-${y}`, kind: 'tree', x, y, dialogue: 'bigtree' })
      if (ch === 'F') objects.push({ id: `carrot${x}-${y}`, kind: 'carrot', x, y })
      if (ch === '=') objects.push({ id: `fence${x}-${y}`, kind: 'fence', x, y })
    }),
  )
  return {
    rev: 0,
    time: 0,
    rumble: 0,
    width,
    height,
    tiles,
    main,
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
