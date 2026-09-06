import { MAPS } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass' | 'charred' | 'farm' | 'rock' // charred: grass the cannon burnt
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Item =
  | 'salt'
  | 'orb'
  | 'electrolytes'
  | 'twig'
  | 'seal'
  | 'egg'
  | 'carrot'
  | 'certificate'
  | 'carpet'
  | 'key'
  | 'rum'
  | 'otijom'
  | 'chair'
// icon frame order in sprites/items
export const ITEMS =
  'salt orb electrolytes twig seal egg carrot certificate carpet key rum otijom chair'.split(
    ' ',
  ) as Item[]

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
  // what he is shoving along: it holds this offset from him for the whole walk and is left behind
  push?: { id: string; dx: number; dy: number }
  lay?: number // the row he stands a cinder block on above every tile he walks, until the walk ends
} & (
  | {
      kind: 'npc'
      sprite: string
      facing: Dir
      dialogue: string
      ride?: string // id of the object he stands on: he takes its tile and its step
      face?: Dir // where he turns once the walk or the spin runs out: a walk up to somebody ends looking at him
      spin?: number // the sim time a spin act ends; until then he turns a quarter every 50 ms
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
  | { kind: 'rum' } // the bottle in the cave: interact carries it off
  // a piece of Etarp's counter: talked across, and with a drink on it interact takes the drink
  | { kind: 'bar'; drink?: boolean }
  | { kind: 'gate' } // locked across the way to the cave: the key opens it, and it is gone
  | { kind: 'chair' } // one of the deck chairs: picked up whole once suspicious harry has allowed it
  | { kind: 'carrot' } // one of the shrimp's crop: interact pulls it up and the tile is bare
  | { kind: 'fence' } // a post and rail of the ring round his field: nothing to do with it, just solid
  // the desalinator 9000: it eats a beauty every 2 s from wherever it lands until a `boom` act
  // sets `boomAt`, which is when it goes up
  | { kind: 'machine'; nextAt?: number; boomAt?: number }
  | { kind: 'floor' } // laid on the ground out of the bag: he walks over it, and it is worth 5 beauty
  | { kind: 'egg' } // the golden egg, stood on the ground out of the bag: solid, and worth 5 at home
  | { kind: 'certificate' } // the shrimp welfare award, the same
  // Etarp's cannon: `firing` until there is nothing left to shell, `nextAt` the next shot's time
  // and `shots` the count so far, which names the balls
  // firing: the tiles still to shoot in order, the ms between shots, when the next is, shots so far
  | { kind: 'cannon'; firing?: { work: number[]; every: number; nextAt: number; shot: number } }
  // a cannonball, for show only: it left the muzzle at x,y at `at` and flies straight down off the map
  | { kind: 'ball'; at: number }
  | { kind: 'cinder' } // a block of the sea horse's wall: solid, and 10 beauty gone
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
  machine: { w: 1, h: 1, solid: true },
  floor: { w: 1, h: 1, solid: false },
  egg: { w: 1, h: 1, solid: true },
  certificate: { w: 1, h: 1, solid: true },
  cannon: { w: 1, h: 1, solid: true },
  ball: { w: 1, h: 1, solid: false },
  cinder: { w: 1, h: 1, solid: true },
}

export interface World {
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  rumble: number // the sim time the screen shake ends; the scene jitters the camera until then
  seed: number // the sim's only randomness, an lcg the cannon draws its targets from
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
  // plays once, when the sim emits `event`, flag `when` (if given) is truthy and flag `unless` (if
  // given) is not; sets flags['fired:<key>'].
  // events: crate:open · menu:close · salt:spawn · salt:place · salt:away (a block laid off the main
  // island) · talk:<npc id> · tree:shake:<n> · tree:near · score:negative (beauty has gone below
  // zero) · score:fifteen (beauty has first reached 15) · arrive:north (stepped ashore up north) ·
  // carrots:done (the last carrot pulled up) · done:<dialogue key> (that box has just closed)
  trigger?: { event: string; when?: string; unless?: string }
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
  // walk: `to` is a tile, and the way there is found (src/game/path.ts): no way at all, and he stays
  // put; somebody standing on it, and he stops on the closest free tile he can reach and turns to
  // face him. `near` is something to walk up to instead — an object id, or `player` — and his tile
  // is the `to`; a solid thing like a boat is stepped onto less the last step.
  // `path` is the exact steps, walked through everything; a boat sails that way. `facing` is the
  // way he turns on arrival, when the last step should not decide it.
  // `push` is an object he shoves along, a fixed tile ahead of him the whole way and through anything
  walk?: {
    id: string
    to?: { x: number; y: number }
    near?: string
    path?: Dir[]
    run?: boolean
    facing?: Dir
    push?: string
  }
  wait?: number // ms
  rumble?: number // ms of screen shake, from now
  spawn?: Obj
  put?: { by: string; obj: Obj } // spawn, but on the nearest free ground beside `by`, his left first
  boom?: string // id of a machine: it goes off 2 s from here, and the act holds until it has
  fire?: string // id of a cannon: 4 s of shots at every grass and object tile from its row down
  // an npc stood at from,y+1 walks right to to,y+1 standing a cinder block on the row above at each tile
  wall?: { id: string; y: number; from: number; to: number }
  bloom?: string // id of a flower: it starts blooming here, and the act is over once it has gone white
  shake?: string // id of a tree: one more shake, and the twig it drops
  fly?: string // id of a tree: it lifts off and is gone 1500 ms later
  land?: string // id of a tree: it comes down out of the sky over 1500 ms
  spin?: string // id of an npc: he whirls round for 2 s, and ends facing the way he was
  drink?: string // id of a bar: a cocktail goes down on it, to be picked up with interact
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
          { id: 'g-machine', kind: 'machine', x: 5, y: 19, nextAt: 86400000 },
          npc('g-seahorse', 'seahorse', 7, 19, 'down', 'seahorse'),
          { id: 'g-wreck', kind: 'boat', x: 5, y: 17, wrecked: true }, // the smashed hull frame
          // the farmer on his stool and on the deck chair he gets for the certificate, and the
          // two prizes that stand on the ground out of the bag
          npc('g-shrimp', 'shrimp', 8, 17, 'down', 'shrimp'),
          npc('g-shrimpchair', 'shrimpchair', 9, 17, 'down', 'shrimp'),
          { id: 'g-egg', kind: 'egg', x: 10, y: 17 },
          { id: 'g-certificate', kind: 'certificate', x: 10, y: 19 },
          // the pirate faces the way he is not looking, so this row draws his back
          npc('g-etarp', 'etarp', 4, 18, 'down', 'etarp'),
          npc('g-harry', 'harry', 8, 19, 'down', 'harry'),
          // the bottom row: the bar bare and with a drink on it, the gate, a deck chair, the rum
          { id: 'g-bar', kind: 'bar', x: 2, y: 21 },
          { id: 'g-bar-drink', kind: 'bar', x: 3, y: 21, drink: true },
          { id: 'g-gate', kind: 'gate', x: 5, y: 21 },
          { id: 'g-chair', kind: 'chair', x: 7, y: 21 },
          { id: 'g-rum', kind: 'rum', x: 9, y: 21 },
          { id: 'g-cannon', kind: 'cannon', x: 4, y: 21 },
          // fired a day of sim time from now, so this one hangs at the muzzle until then
          { id: 'g-ball', kind: 'ball', x: 6, y: 21, at: 86400000 },
          { id: 'g-cinder', kind: 'cinder', x: 8, y: 21 },
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
      if (ch === '=') objects.push({ id: `fence${x}-${y}`, kind: 'fence', x, y })
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
  }
}
