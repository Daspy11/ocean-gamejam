import { gallery } from './gallery'
import { MAPS } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass' | 'charred' | 'farm' | 'rock' // charred: burnt grass, laid by nothing yet
export type Dir = 'up' | 'down' | 'left' | 'right'
// every item there is, in icon frame order in sprites/items
export const ITEMS = [
  'salt',
  'orb',
  'electrolytes',
  'twig',
  'seal',
  'egg',
  'carrot',
  'certificate',
  'carpet',
  'key',
  'rum',
  'otijom',
  'chair',
] as const
export type Item = (typeof ITEMS)[number]

// a cannon mid-act: when it stops, when the next ball leaves, and balls so far
type Firing = { until: number; ballAt: number; shot: number }

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
  // id of what he is shoving along: it goes the step ahead of him for the whole walk and is left behind
  push?: string
  // the tile it left a hand on and when: the scene arcs it over from there for 300 ms
  thrown?: { x: number; y: number; at: number }
} & (
  | {
      kind: 'npc'
      sprite: string
      facing: Dir
      dialogue: string
      ride?: string // id of the object he stands on: he takes its tile and its step
      face?: Dir // where he turns once the walk or the spin runs out: a walk up to somebody ends looking at him
      spin?: number // the sim time a spin act ends; until then he turns a quarter every 50 ms
      flat?: boolean // knocked off what he was riding: he lies face down, a quarter turn over
    }
  // thrown into the sea it boils its tile into salt once w.time reaches doneAt
  | { kind: 'orb'; doneAt: number }
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
  // wrecked: it sailed into something, so the bow is stove in. dialogue: what interact reads out, else `boat`
  | { kind: 'boat'; wrecked?: boolean; dialogue?: string }
  | { kind: 'crate'; open: boolean; item: Item } // `item` is what opening it hands over, once
  | { kind: 'sign'; dialogue: string } // interact reads it: the text is a dialogue with no speaker
  // planted by a cutscene: blooming starts at bloomAt, and 1500 ms later it is white and worth 10 beauty
  | { kind: 'flower'; bloomAt?: number; white?: boolean }
  // walked onto rather than into, like a floor, but stepping on it puts the player down at `to`
  | { kind: 'cave'; to: { x: number; y: number } }
  | { kind: 'rum' } // the bottle in the cave: interact carries it off
  // a piece of Etarp's counter: talked across, and with a drink on it interact takes the drink
  | { kind: 'bar'; drink?: boolean }
  | { kind: 'gate' } // locked across the way to the cave: the key opens it, and it is gone
  | { kind: 'chair' } // one of the deck chairs: picked up whole once suspicious harry has allowed it
  | { kind: 'carrot' } // one of the shrimp's crop: interact pulls it up and the tile is bare
  | { kind: 'fence' } // a post and rail of the ring round his field: nothing to do with it, just solid
  | { kind: 'fencev' } // the same post, drawn for a run of the ring climbing north-south instead
  // the desalinator 9000: it eats a beauty every 2 s from wherever it lands until a `boom` act
  // sets `boomAt`, which is when it goes up
  | { kind: 'machine'; nextAt?: number; boomAt?: number }
  | { kind: 'floor' } // laid on the ground out of the bag: he walks over it, and it is worth 5 beauty
  | { kind: 'egg' } // the golden egg, stood on the ground out of the bag: solid, and worth 5 at home
  | { kind: 'certificate' } // the shrimp welfare award, the same
  // Etarp's cannon: `firing` for its 4 s of noise, `shot` counting the balls, which names them
  | { kind: 'cannon'; firing?: Firing }
  // a cannonball, for show only: it left the muzzle at x,y at `at` and flies straight off the map,
  // `dir` degrees off straight left
  | { kind: 'ball'; at: number; dir: number }
  // a ball that stuck where it fell instead of flying on: walked over, and an eyesore at -3 beauty
  | { kind: 'embedded' }
  | { kind: 'cinder' } // a solid block: nothing stands one any more, so the sheet is spare
  // what Tarq rides in on: walked by `path` like a boat, through anything. landAt is when it
  // started wafting down out of the sky, 3 s before it settles
  | { kind: 'flyingcarpet'; landAt?: number }
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
  rum: { w: 1, h: 1, solid: true },
  bar: { w: 1, h: 1, solid: true },
  gate: { w: 1, h: 1, solid: true },
  chair: { w: 1, h: 1, solid: true },
  carrot: { w: 1, h: 1, solid: true },
  fence: { w: 1, h: 1, solid: true },
  fencev: { w: 1, h: 1, solid: true },
  machine: { w: 1, h: 1, solid: true },
  floor: { w: 1, h: 1, solid: false },
  egg: { w: 1, h: 1, solid: true },
  certificate: { w: 1, h: 1, solid: true },
  cannon: { w: 1, h: 1, solid: true },
  ball: { w: 1, h: 1, solid: false },
  embedded: { w: 1, h: 1, solid: false },
  cinder: { w: 1, h: 1, solid: true },
  flyingcarpet: { w: 1, h: 1, solid: true },
}

export interface World {
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  rumble: number // the sim time the screen shake ends; the scene jitters the camera until then
  seed: number // the sim's only randomness, an lcg the cannon draws its ball angles from
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
    path?: Dir[] // the steps a cutscene is walking him, and the way it leaves him facing
    face?: Dir
    ride?: string // id of what he is standing on: he takes its tile and its step, like any npc
  }
  inventory: Partial<Record<Item, number>>
  score: number // beauty: -1 per salt block placed, +10 a bloomed flower; hidden until flags['score:on']
  pops: { x: number; y: number; text: string; at: number }[] // floating score text over tile x,y, gone 1500 ms after `at`
  objects: Obj[]
  // story state. Strings let dialogue rename things: flags['name:orb'] overrides the item's display name
  flags: Record<string, boolean | number | string>
  // item fills {item} in text; until is the sim time a `wait` act on the open node ends
  dialogue: null | {
    key: string
    node: string
    choice: number
    item?: Item
    until?: number
    back?: { key: string; node: string; item?: Item } // where a got box that cut in returns to
  }
  queue: { key: string; item?: Item }[] // dialogues waiting for the open one to close, in order
  // the `throw` act in flight: what he is fetching, who it is for, and when it left his hand
  throwing: null | { kind: Obj['kind']; at: string; flew?: number }
  menu: null | { screen: 'inventory'; cursor: number }
  // a close-up over the world: `sheet` drawn big on black, its frames from `frame` every 400 ms
  // from `at`, and the black has been up since `since`. Down when the box closes. With `burst`
  // the camera zooms in on the npc instead, under shooting stars: null until the burst act, then
  // when he started to shake white, shattering 1200 ms on; `down` is when the zoom back out began.
  closeup: null | {
    sheet: string
    frame: number
    frames: number
    at: number
    since: number
    burst?: null | number
    down?: number
    zoom?: number // how far the burst camera comes in, 7.5x by default
  }
}

export type Action =
  | { type: 'tick'; dt: number }
  | { type: 'move'; dir: Dir | null; run?: boolean } // the held direction changed; null = released
  | { type: 'interact' }
  | { type: 'talk'; key: string } // open a dialogue by key (scripted scenes; npcs go through interact)
  | { type: 'menu' } // toggle the inventory screen

import type { Rect } from './script'
export type { Branch, Content, Dialogue, DialogueNode, Rect } from './script'

// is the player stood inside this rect of tiles
export const inside = (w: World, r: Rect) =>
  w.player.x >= r.x && w.player.x < r.x + r.w && w.player.y >= r.y && w.player.y < r.y + r.h

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

// every npc in the two lists below: who he is, the sheet he is drawn from, where he stands and
// what he says
export const npc = (
  id: string,
  sprite: string,
  x: number,
  y: number,
  facing: Dir,
  dialogue: string,
): Obj => ({ id, kind: 'npc', sprite, x, y, facing, dialogue })

export function createWorld(map: keyof typeof MAPS = 'island'): World {
  const rows = MAPS[map]
  const [width, height] = [rows[0].length, rows.length]
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
    // the four neighbours, minus any that fell off an end of the map or wrapped onto another row
    for (const to of [at - 1, at + 1, at - width, at + width])
      if (to >= 0 && to < tiles.length && Math.abs((to % width) - (at % width)) <= 1) edge.push(to)
  }
  const objects: Obj[] =
    map === 'gallery'
      ? gallery()
      : [
          { id: 'boat1', kind: 'boat', x: 12, y: 16 },
          // thrown clear of the boat in the crash and left lying in the sand: picked up, not opened
          { id: 'orb1', kind: 'orb', x: 13, y: 15, doneAt: 0 },
          // the second crate, over on the far island: the reason to bridge the gap
          { id: 'crate2', kind: 'crate', x: 24, y: 17, open: false, item: 'electrolytes' },
          npc('mich', 'mich', 13, 17, 'right', 'mich'),
          { id: 'tree1', kind: 'tree', x: 16, y: 16 },
          { id: 'sign1', kind: 'sign', x: 25, y: 16, dialogue: 'sign' },
          // out on the big island, on the grass the forest leaves clear
          { id: 'crate3', kind: 'crate', x: 48, y: 22, open: false, item: 'seal' },
          npc('albatross', 'albatross', 36, 20, 'down', 'albatross'),
          // the mouth walled in by the forest, and the sand tile at the far end of the room
          { id: 'cave1', kind: 'cave', x: 42, y: 17, to: { x: 10, y: 40 } },
          { id: 'caveout', kind: 'cave', x: 10, y: 41, to: { x: 42, y: 18 } },
          { id: 'rum1', kind: 'rum', x: 10, y: 37 },
          // the locked gate at the south end of the corridor through the forest to the mouth
          { id: 'gate1', kind: 'gate', x: 42, y: 21 },
          // the farmer, sat on his stool right above the gate in his fence
          npc('shrimp', 'shrimp', 49, 13, 'down', 'shrimp'),
          // the chest on the north island's west tip, with the key to the gate in it
          { id: 'crate4', kind: 'crate', x: 19, y: 3, open: false, item: 'key' },
          // suspicious harry, stood over his three deck chairs on the big island's south shore
          npc('harry', 'harry', 42, 25, 'up', 'harry'),
          { id: 'chair1', kind: 'chair', x: 41, y: 26 },
          { id: 'chair2', kind: 'chair', x: 42, y: 26 },
          { id: 'chair3', kind: 'chair', x: 43, y: 26 },
        ]
  // the forest and the carrot field are drawn in the map rather than listed: one object per glyph
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'T') objects.push({ id: `tree${x}-${y}`, kind: 'tree', x, y, dialogue: 'bigtree' })
      if (ch === 'F') objects.push({ id: `carrot${x}-${y}`, kind: 'carrot', x, y })
      // a run with fence on neither side but one above or below is climbing north-south
      if (ch === '=') {
        const vertical =
          (rows[y - 1]?.[x] === '=' || rows[y + 1]?.[x] === '=') &&
          row[x - 1] !== '=' &&
          row[x + 1] !== '='
        objects.push({ id: `fence${x}-${y}`, kind: vertical ? 'fencev' : 'fence', x, y })
      }
    }),
  )
  return {
    rev: 0,
    time: 0,
    rumble: 0,
    seed: 1,
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
    throwing: null,
    closeup: null,
  }
}
