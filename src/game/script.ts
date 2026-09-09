import type { Dir, Item, Obj } from './world'

// The content side of the game: what a dialogue file is, and every act a cutscene node can run.
// Data only, so a whole scene is one json file and every path through it is testable without Phaser.

export type Rect = { x: number; y: number; w: number; h: number } // tiles, x,y the top-left
// one entry of a `start` or a branching `next`: it wins if its flag is set, the bag holds `has`
// and the player stands in `in`
export type Branch = { when?: string; has?: Partial<Record<Item, number>>; in?: Rect; node: string }

export interface Dialogue {
  name: string
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
  face?: { id: string; dir: Dir } // turns an npc on the spot, for one riding something and unable to walk
  ride?: { id: string; on: string } // he gets on what it names, npc or player, and is carried by it
  // the player fetches the first object of that kind and hucks it at the npc `at`, `src/game/throw.ts`
  throw?: { kind: Obj['kind'] | 'seal'; at: string }
  drink?: string // id of a bar: a cocktail goes down on it, to be picked up with interact
  // spends items as the node opens, one of an Item or the counts in a record; no got box
  take?: Item | Partial<Record<Item, number>>
  give?: Item // hands over one as the node opens: a crate's gain, got box and all, from a line
  set?: Record<string, boolean | number | string>
  // used when there are no choices; null or missing closes the dialogue. A list is read like `start`:
  // the first matching entry wins, and none matching closes it.
  next?: string | null | Branch[]
  after?: number // ms: a text node with one moves on by itself once it has been up that long
  choices?: { text: string; next: string | null; set?: Record<string, boolean | number | string> }[]
}

export interface Content {
  dialogues: Record<string, Dialogue>
  items: Partial<Record<Item, { name: string }>>
}
