export { createWorld } from './map'

// The whole game state. Plain data: JSON-safe and structuredClone-able. Coordinates are tiles.
export type Tile = 'water' | 'salt' | 'sand' | 'grass' | 'charred' | 'farm' | 'rock' // charred: burnt grass, laid by nothing yet
export type Dir = 'up' | 'down' | 'left' | 'right'
// Every item in icon order; sprites/items skips unused frame 4, and glassi has its own sheet.
export const ITEMS = [
  'salt',
  'orb',
  'electrolytes',
  'twig',
  'egg',
  'carrot',
  'certificate',
  'carpet',
  'key',
  'rum',
  'otijom',
  'chair',
  'glassi',
  'note',
] as const
export type Item = (typeof ITEMS)[number]

// a cannon mid-act: when it stops, when the next ball leaves, and balls so far
type Firing = { until: number; ballAt: number; shot: number; duel?: boolean }

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
  back?: boolean // scripted walking backwards keeps the actor facing the person in front
  parity?: boolean
  // id of what he is shoving along: it goes the step ahead of him for the whole walk and is left behind
  push?: string
  // the tile it left and when: objects arc for 300 ms; an npc somersaults for 600 ms
  thrown?: { x: number; y: number; at: number }
  // drawn into somebody else's sheet instead, so this one draws nothing of its own
  hidden?: boolean
} & (
  | {
      kind: 'npc'
      sprite: string
      facing: Dir
      dialogue: string
      wander?: { x: number; y: number; wait?: number } // fixed 4x4 patch and remaining idle milliseconds
      ride?: string // id of the object he stands on: he takes its tile and its step
      hop?: { x: number; y: number; at: number; duration?: number } // fixed duration, even if his deck moves
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
  | { kind: 'crate'; open: boolean; item?: Item; dialogue?: string } // opening gives an item or reads a dialogue, once
  | { kind: 'sign'; dialogue: string } // interact reads it: the text is a dialogue with no speaker
  // suspicious harry: he never walks, so interact just reads his dialogue, like a tree. His 4x2
  // footprint is his whole picture, lying across the chairs, so nobody walks through him
  | { kind: 'harry'; dialogue: string; satAt?: number } // lowers his feet over 600 ms, then stays seated
  // planted by a cutscene: blooming starts at bloomAt, and 1500 ms later it is white and worth 10 beauty
  | { kind: 'flower'; bloomAt?: number; white?: boolean }
  // walked onto rather than into, like a floor, but stepping on it puts the player down at `to`.
  // `inside` is the room-side mouth, drawn from the sheet's second frame
  | { kind: 'cave'; to: { x: number; y: number; area?: 'island' | 'cave' }; inside?: boolean }
  | { kind: 'rum' } // the bottle in the cave: interact carries it off
  // a piece of Etarp's counter: talked across, and with a drink on it interact takes the drink
  | { kind: 'bar'; drink?: boolean }
  | { kind: 'gate' } // locked across the way to the cave: the key opens it, and it is gone
  | { kind: 'chair'; beauty?: number } // picking it back up removes the points it actually added
  // harry's middle chair, one chair painted across two tiles: interact on either half takes it whole
  | { kind: 'splitchair' }
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
  // `right` points it east instead of west: the sea horse's, aimed back up the island at Etarp
  | { kind: 'cannon'; firing?: Firing; right?: boolean }
  // a cannonball, for show only: it left the muzzle at x,y at `at` and flies straight off the map,
  // `dir` degrees off straight left
  | { kind: 'ball'; at: number; dir: number; life?: number }
  // a ball that stuck where it fell instead of flying on: walked over, and an eyesore at -3 beauty
  | { kind: 'embedded' }
  | { kind: 'cinder' } // a solid block: nothing stands one any more, so the sheet is spare
  // what Tarq rides in on: walked by `path` like a boat, through anything. landAt is when it
  // started wafting down out of the sky, 3 s before it settles; liftAt when it took off again,
  // and it climbs for a second before it moves
  | { kind: 'flyingcarpet'; landAt?: number; liftAt?: number }
)

export const KINDS: Record<Obj['kind'], { w: number; h: number; solid: boolean }> = {
  npc: { w: 1, h: 1, solid: true },
  orb: { w: 1, h: 1, solid: true },
  tree: { w: 1, h: 1, solid: true },
  boat: { w: 2, h: 1, solid: true },
  crate: { w: 1, h: 1, solid: true },
  sign: { w: 1, h: 1, solid: true },
  harry: { w: 4, h: 2, solid: true },
  flower: { w: 1, h: 1, solid: true },
  cave: { w: 1, h: 1, solid: false },
  rum: { w: 1, h: 1, solid: true },
  bar: { w: 1, h: 1, solid: true },
  gate: { w: 1, h: 1, solid: true },
  chair: { w: 1, h: 1, solid: true },
  splitchair: { w: 2, h: 1, solid: true },
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
  controls?: { confirm: string; inventory: string } // button labels selected at the title
  area?: 'island' | 'cave'
  away?: Pick<World, 'width' | 'height' | 'left' | 'tiles' | 'main' | 'objects' | 'pops'>
  rev: number // bumped by apply() on every visible change; scenes resync when it moves
  time: number // sim milliseconds
  interactCue?: number // monotonic cue count; the scene coalesces simultaneous interactions
  chimeCue?: number // menu choices and successful placement on the home island
  explosionCue?: number // counts extractor explosions so audio survives the object's removal
  rumble: number // the sim time the screen shake ends; the scene jitters the camera until then
  seed: number // the sim's only randomness, an lcg the cannon draws its ball angles from
  width: number
  left?: number // western map edge; absent in older snapshots, which start at zero
  height: number
  tiles: Tile[] // row-major, index = y * width + x - (left ?? 0)
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
    hop?: { x: number; y: number; at: number; duration?: number } // fixed duration, even if his deck moves
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
    object?: string // the specific object or inventory copy chosen for a throw
    until?: number
    back?: { key: string; node: string; item?: Item } // where a got box that cut in returns to
  }
  queue: { key: string; item?: Item }[] // dialogues waiting for the open one to close, in order
  typing?: { text: string; at: number; done?: boolean; who?: string } // resolved line, speaker and reveal start
  // the `throw` act in flight: what he is fetching, who it is for, and when it left his hand
  throwing: null | {
    kind: Obj['kind']
    at: string
    object: string
    launchAt?: number // 300 ms to wind up after the fetch path finishes
    hit?: boolean
    flight?: {
      x: number
      y: number
      vx: number
      vy: number
      at: number
      hitAt: number
      until: number
    }
  }
  menu: null | { screen: 'inventory'; cursor: number }
  farewell?: { phase: 'waiting' | 'approach' | 'alongside' | 'leave' | 'gone' | 'done'; at: number }
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
    auto?: true // an item handover holds its line through zoom, burst and zoom back out
    down?: number
    zoom?: number // how far the burst camera comes in, 7.5x by default
  }
}

export type Action =
  | { type: 'tick'; dt: number }
  | { type: 'move'; dir: Dir | null; run?: boolean } // the held direction changed; null = released
  | { type: 'interact' }
  | { type: 'confirm' } // player press: finish revealing the line before advancing; interact stays immediate
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

export function rnd(w: World): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0
  return w.seed / 4294967296
}

export const tileIndex = (w: World, x: number, y: number) => y * w.width + x - (w.left ?? 0)

export function cueInteract(w: World, chime = false): void {
  const cue = chime ? 'chimeCue' : 'interactCue'
  w[cue] = (w[cue] ?? 0) + 1
  w.rev++
}

export function tileAt(w: World, x: number, y: number): Tile | undefined {
  const column = x - (w.left ?? 0)
  if (column < 0 || y < 0 || column >= w.width || y >= w.height) return undefined
  return w.tiles[tileIndex(w, x, y)]
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
