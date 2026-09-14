import { tileAt, type Dir, type Item, type Obj, type World } from './world'

// These node numbers match the author's hint list; ready trades beat further collecting.
export function michHint(w: World): string {
  const f = w.flags
  const bag = w.inventory
  if (!f['had:orb'] && !bag.orb) return '1'
  if (!bag.orb && w.objects.some((o) => o.kind === 'orb' && tileAt(w, o.x, o.y) === 'salt'))
    return '5'
  if (bag.orb && !f['fired:firstsalt'] && !f['score:on']) return '3'
  if (!f['had:electrolytes'] && !f['score:on']) return '6'
  if (!f['albatross:egg'] && (bag.twig ?? 0) >= 10) return '11'
  if (f['shrimp:asked'] && !f['shrimp:chair'] && !f['shrimp:thanked'] && (bag.carrot ?? 0) >= 12)
    return '15'
  if (bag.otijom && !f['harry:ok']) return '23'
  if (bag.rum && f['etarp:bar'] && !f['etarp:served']) return '21'
  if (bag.certificate) return '26'
  if (bag.egg) return '12'
  if (bag.carpet) return '7'
  if (!f['harry:ok'] && w.objects.some((o) => o.kind === 'bar' && o.drink)) return '22'
  if (bag.key && w.objects.some((o) => o.kind === 'gate')) return '19'
  if (
    (f['fired:pirate'] || f['etarp:bar']) &&
    !f['had:key'] &&
    w.objects.some((o) => o.id === 'crate4' && o.kind === 'crate' && !o.open)
  )
    return '18'
  if (
    f['harry:ok'] &&
    !f['shrimp:thanked'] &&
    !bag.chair &&
    w.objects.some((o) => o.kind === 'chair')
  )
    return '24'
  if (
    f['shrimp:chair'] &&
    !f['shrimp:thanked'] &&
    !f['harry:asked'] &&
    !f['harry:ok'] &&
    !bag.chair
  )
    return '16'
  if (
    f['harry:asked'] &&
    !f['harry:ok'] &&
    !f['fired:pirate'] &&
    !f['etarp:bar'] &&
    !f['talked:sign']
  )
    return '17'
  if (
    f['talked:albatross'] &&
    !f['albatross:egg'] &&
    !f['tree:promised'] &&
    !f['tree:gone'] &&
    w.objects.some((o) => o.id === 'tree1' && o.kind === 'tree' && o.flyAt === undefined)
  )
    return '10'
  if (
    f['shrimp:asked'] &&
    !f['shrimp:chair'] &&
    !f['shrimp:thanked'] &&
    w.objects.some((o) => o.kind === 'carrot')
  )
    return '14'
  if (f['arrived:big'] && !f['shrimp:asked'] && !f['shrimp:chair'] && !f['shrimp:thanked'])
    return '13'
  return '8'
}

export function revealed(text: string, elapsed: number): number {
  // Return a string offset without splitting a surrogate pair.
  return Array.from(text)
    .slice(0, Math.max(0, Math.floor(elapsed / 14)))
    .join('').length
}

// The content side of the game: what a dialogue file is, and every act a cutscene node can run.
// Data only, so a whole scene is one json file and every path through it is testable without Phaser.

export type Rect = { x: number; y: number; w: number; h: number } // tiles, x,y the top-left
// one entry of a `start` or a branching `next`: it wins if its flag is set, the bag holds `has`
// and the player stands in `in`
export type Branch = { when?: string; has?: Partial<Record<Item, number>>; in?: Rect; node: string }

export interface Dialogue {
  name: string
  hint?: 'mich' // choose a repeatable clue from the current quests instead of start
  // plays once, when the sim emits `event`, flag `when` (if given) is truthy and flag `unless` (if
  // given) is not; sets flags['fired:<key>'].
  // events: crate:open (a crate, or the orb picked up off the sand) · menu:close · salt:spawn · salt:place · salt:away (a block laid off the main
  // island) · talk:<npc id> · tree:shake:<n> · tree:near · score:negative (beauty has gone below
  // zero) · score:fifteen (beauty has first reached 15) · arrive:north (stepped ashore up north) ·
  // done:<dialogue key> (that box has just closed)
  trigger?: { event: string; when?: string; unless?: string }
  start: Branch[] // first entry that matches wins
  nodes: Record<string, DialogueNode>
}
export interface DialogueNode {
  text?: string // may contain {item}, replaced with the display name of dialogue.item
  // speaker name: absent = the dialogue's name, '' = the lead ('You'), null = nobody, a system line
  who?: string | null
  // A node without text is an act: the box hides, the act runs, and the node advances to `next` by
  // itself once it is done (walk: the npc has arrived; wait: the time has passed; spawn and shake:
  // at once; fly: the tree has gone; land: it has come down; rumble: the shake is over). Interact
  // and move are ignored while an act runs, except that a `clear` act lets him walk.
  // walk: `to` is a tile, and the way there is found (src/game/path.ts): no way at all, and he stays
  // put; somebody standing on it, and he stops on the closest free tile he can reach and turns to
  // face him. `near` is something to walk up to instead — an object id, or `player` — and his tile
  // is the `to`; a solid thing like a boat is stepped onto less the last step.
  // `path` is the exact steps, walked through everything; a boat sails that way. `facing` is the
  // way he turns on arrival, when the last step should not decide it.
  // `push` is an object he shoves along: it leads him by a step, round every corner, through anything
  walk?: {
    id: string
    to?: { x: number; y: number }
    near?: string
    path?: Dir[]
    run?: boolean
    facing?: Dir
    push?: string
    retreat?: number // approach an npc with a clear salt strip behind them; zero keeps their facing
    back?: number // back up this many tiles while keeping the current facing
  }
  wait?: number // ms
  rumble?: number // ms of screen shake, from now
  spawn?: Obj
  spawnRelative?: 'player' // spawn x,y are offsets from the player instead of map coordinates
  put?: { by: string; obj: Obj } // spawn, but on the nearest free ground beside `by`, his left first
  boom?: string // id of a machine: it goes off 2 s from here, and the act holds until it has
  fire?: string // id of a cannon: 4 s of balls out of the muzzle to the left, for show
  clear?: Rect // the box hides and he is free to walk; the act is over once he stands outside this
  // the screen goes black and `sheet` plays big in the middle, `frames` of it from `frame` on
  // null takes it down again; `burst` zooms in on the npc of that sheet for a burst act instead
  closeup?: {
    sheet: string
    frame?: number
    frames?: number
    burst?: boolean
    zoom?: number
  } | null
  burst?: boolean // the close-up shakes white and shatters into stars, 2 s in all
  bloom?: string // id of a flower: it starts blooming here, and the act is over once it has gone white
  shake?: string // id of a tree: one more shake, and the twig it drops
  fly?: string // id of a tree: it lifts off and is gone 1500 ms later
  land?: string // id of a tree: it comes down out of the sky over 1500 ms
  spin?: string // id of an npc: he whirls round and ends facing the way he was, 10 turns by default
  sit?: string // Harry lowers his feet off the chairs over 600 ms
  face?: { id: string; dir: Dir } // turns an npc on the spot, for one riding something and unable to walk
  ride?: { id: string; on: string } // he gets on what it names, npc or player, and is carried by it
  // the player fetches the first object of that kind and hucks it at the npc `at`, `src/game/throw.ts`
  throw?: { kind: Obj['kind']; at: string }
  drink?: string // id of a bar: a cocktail goes down on it, to be picked up with interact
  // spends items as the node opens, one of an Item or the counts in a record; no got box
  take?: Item | Partial<Record<Item, number>>
  give?: Item // hands over one as the node opens: a crate's gain, got box and all, from a line
  open?: string // opens this crate once, handing over its loot and firing crate:open
  set?: Record<string, boolean | number | string>
  // used when there are no choices; null or missing closes the dialogue. A list is read like `start`:
  // the first matching entry wins, and none matching closes it.
  next?: string | null | Branch[]
  after?: number // ms: a text node with one moves on by itself once it has been up that long
  choices?: {
    text: string
    next: string | null
    set?: Record<string, boolean | number | string>
    has?: Partial<Record<Item, number>>
  }[]
}

export interface Content {
  dialogues: Record<string, Dialogue>
  items: Partial<Record<Item, { name: string }>>
}
