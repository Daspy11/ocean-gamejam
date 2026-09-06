# Project Island

Cute, wholesome top-down pixel-art RPG for a 14-day jam. Skyblock-style loop: collect stone from tide
pools, place it on water to grow the island, talk to NPCs, make choices that set story flags.
Phaser 3.90 (not 4) + TypeScript + Vite. Ships as HTML5 on itch.io.

## Commands

- `npm run dev` — game at http://localhost:5173
- `npm test` — unit tests (Vitest) for `src/game/**`
- `npm run e2e` — Playwright drives the real game through `window.island`
- `npm run check` — typecheck + lint + unit + e2e. **Must pass before you report a task done.**
- `npm run placeholders` — regenerate `placeholder/` from `scripts/placeholders.mjs`
- `npm run build` — `dist/` for itch.io

## Layout

```
src/game/      Pure simulation: World type + apply(world, action, content). No Phaser (lint-enforced).
               Every gameplay rule lives here and is unit-tested here.
src/store.ts   The one `world` instance, dispatch/load, and the `window.island` puppet API.
src/scenes/    Phaser. Boot loads assets. Island draws the world and turns input into actions. UI draws HUD + dialogue.
               Scenes read `world` and call `dispatch`. They never mutate `world` directly.
src/assets.ts  Manifest of every sheet/json with frame layout. Resolves assets/ (real) over placeholder/.
assets/        HUMAN-MADE ONLY. Never write here.
placeholder/   AI stand-ins, produced only by scripts/placeholders.mjs.
e2e/           Playwright specs.
```

## How the game works

- `World` is one plain, JSON-safe object: tiles, player, inventory, objects, flags, dialogue, menu.
  Snapshot with `structuredClone`; save/load will be `JSON.stringify` when we need it.
- Four actions: `tick`, `move` (the held direction changed), `interact`, `menu`. Input becomes actions;
  `apply` mutates `world` in place and bumps `world.rev` on any visible change; scenes resync when `rev`
  moves. Idle ticks and step progress don't bump `rev`.
- Movement follows RPG Maker / Pokémon conventions and lives entirely in the sim: 4-direction grid walking
  at 4 tiles/s (Shift runs at 2x), no gap between steps while held, tap to turn without moving, direction
  changes at tile boundaries. `player.step` is the tile being walked to plus progress 0..1; scenes draw the
  player every frame from that (no tweens, no Phaser animations). World coordinates are tiles; scenes
  multiply by 16.
- Everything standing on the ground is an `Obj` in `world.objects` with a `kind`. `KINDS` gives the tile
  footprint and solidity. `cave` and `floor` are the non-solid kinds, walked over rather than into;
  stepping onto a `cave` puts the player at its `to` (the big island's cave mouth leads to a rock-walled
  room in the map's bottom-left corner, and back; a one-tile corridor runs down from the mouth through
  the forest to a locked `gate` at 42,21, which the key from the chest on the north island opens and
  removes). The `rum` bottle in the room is picked up whole, like the orb; so is a `chair`, once
  `flags['harry:ok']`, and before that it is Harry's `handsoff.json`. A `bar` is talked across: interact
  on a bare piece of counter reaches the npc on its far side, and with a drink on it takes the drink
  (`otijom`). A `cannon` is solid and, once a `fire` act lights it, shells the main island from its
  row down for 4 s, one shot per grass or object tile in a seeded random order: the object is
  gone and grass turns `charred` at -3 beauty the moment the shot goes. A `ball` is for show only,
  flying straight down out of the muzzle and off the map over 1500 ms. A `cinder` is a solid
  block of the sea horse's wall, -10 each. Sprites come from `sprites/<kind>`, are bottom-anchored, and are depth-sorted by their feet Y,
  so tall things overlap what's behind them (top-down oblique). To add an object kind: one
  union member, one `KINDS` row, one manifest entry, one placeholder entry.
- Ground is drawn with layered dual-grid autotiling: `tiles/water` is the base, and each higher terrain
  has one 5x3 sheet (a 3x3 island, a 2x2 hole, two diagonals; frame for a corner mask via `DUAL_FRAME`
  in `src/assets.ts`) drawn over whatever is below. A layer's mask counts any terrain above it as itself,
  so a rounded corner reveals the terrain below and never water. One sheet per terrain covers every
  transition. `rock` is the top layer and the only solid one: everything but water and rock is
  walked on. `charred` sits just over grass, since it only ever replaces some of it.
  Adding a terrain: add it to `Tile`, the draw order in `Island.ts`, the manifest, the
  placeholder script, and `assets/README.md`.
- `assets/README.md` is the artist's spec. Keep it true when a sheet layout changes. `?map=gallery`
  renders every tile, transition, object, and character with the real game code.
- Dialogue is data (`Dialogue` json, see `src/game/world.ts`). Current node and choice cursor live in
  `world.dialogue`; the inventory screen's cursor lives in `world.menu`. The UI is stateless, so every
  dialogue path and menu state is testable without Phaser.
- Scripting is data too. A dialogue file may declare `trigger: { event, when? }` and plays once when the
  sim emits that event (`crate:open`, `menu:close`, `salt:spawn`, `salt:place`, `talk:<npc id>`,
  `tree:shake:<n>`, `tree:near`, `score:negative`, `arrive:north`, `salt:away` (any item put down off
  the main island), `carrots:done`, `score:fifteen`, `done:<dialogue key>` (that box has just
  closed), add more in `apply`) and the `when` flag is
  truthy and the `unless` flag is not (`negative.json` is dead once the sea horse has been met); it
  sets `flags['fired:<key>']`. A `start` or `next` entry may also need items: `has: { twig: 10 }`.
  Dialogues that fire while a box is open wait in
  `world.queue`. Node `set` may write strings; `flags['name:<item>']` renames an item; node `take`
  spends an item (or the counts in a record: `{ twig: 10 }`); node `give` hands one over, got box and
  all. `{item}` in text becomes the name of `dialogue.item`; `{score}` the beauty score. The first
  pickup of each item plays `got.json`. To add a tutorial beat: write a dialogue file with a trigger,
  and if it needs a new event, emit it from `apply`. No trigger system.
- Cutscenes are dialogue nodes without `text` (acts): `walk` an npc to a tile, `wait` ms, `spawn` an
  object, `put` one down on the nearest free ground beside somebody (`src/game/machine.ts`), `bloom` a
  flower, `shake` / `fly` / `land` a tree (`src/game/tree.ts`), `rumble` the screen, `spin` an npc
  (2 s of quarter turns every 50 ms, then back to how he faced, `src/game/boat.ts`), `drink` (a
  cocktail stood on the `bar` it names), `fire` a cannon down the island for 4 s
  (`src/game/cannon.ts`), `wall` (an npc stood at its start walks right along the row under it
  standing a cinder block above every tile, `src/game/machine.ts`), and `gone`, which
  just holds until the object it names has left the world. The box hides, the act runs, and the node
  advances itself. A walk with `to` finds its way by A* (`src/game/path.ts`): who can cross what is
  `MODES` there, keyed by sprite (a flyer is stopped only by another flyer, a swimmer by rock, solid
  objects and anyone on the ground, a walker by water too); another character is crossed only when
  there is no other way, the player being the one to push past first; and no way at all means he
  stays put and the act is over; somebody standing on the tile means he ends on the closest free
  tile he can reach and turns to face him; `facing` turns him that way once he is there. A walk
  with `push` shoves an object along, a fixed offset ahead of him the whole way and through
  anything, and leaves it where he stops. A walk
  with `path` is the exact steps, through everything: a boat sails that way, and stops `wrecked`
  when its next tile is not water (`src/game/boat.ts`). An npc with `ride` sits on the object it
  names. A walk with `near` walks up to something — an object id, or `player` — using its tile as
  the `to`, so a character is faced from beside him as above, and a solid thing like a boat is
  stopped at on the tile before it. See `assets/dialogue/flower.json` and `pirate.json`.
- The island grows by the orb: thrown on a water tile it boils it (smoke) and after 2 s that tile is
  `salt`, and the orb is picked back up. A crust once laid stays laid — there is no digging it back up,
  so every block costs its beauty for good. A `salt` item in hand still fills a water tile in the same
  way, but nothing hands one out any more, so `salt:place` (`insalting.json`) is unreachable for now.
  Interact in the inventory (E / Enter) uses the slot the cursor is on against the tile in front of him:
  `useItem` in `src/game/salt.ts` throws the orb, lays a block of salt, or stands the carpet (a
  `floor`), the golden `egg`, the `certificate` or a deck `chair` on bare ground, and the bag shuts
  so he can see it land. Each is worth 5 at home, except that the last of the carpet, the egg and
  the certificate to go down (`flags['placed:<item>']`) is worth whatever multiple of 5 brings
  beauty to 15, so the sea horse comes once everything is down; a chair picked back up takes its 5
  with it. Nothing else in the bag goes anywhere. The map is
  ASCII in `src/game/map.ts` (64x44; `^` is rock, `T` is grass with a big-island tree on it, `F` is
  farmland with a carrot on it, `=` is grass with a fence post on it); edit it by hand.
- Score is `world.score` (beauty), shown in the HUD only once `flags['score:on']` (Walter's scene sets
  it). A bloomed flower is +10, a `floor` +5, placing salt is -1, but only on the main island:
  `world.main` is flood-filled from the spawn when the world is made and grows through salt laid next
  to it, and the desalinator's blast joins its whole crust (`blast` in `src/game/machine.ts`). A
  charred tile is -3, a cinder block -10. Anything put down anywhere else counts for nothing and fires `salt:away` (Walter's reminder in
  `assets/dialogue/away.json`) instead of `salt:place`. `world.pops` are the floating +N/-N.
- Scene flow: Boot → Intro (the rowboat cutscene, data in `assets/text/intro.json`; it opens on the
  sea and waits for a press before the first line) → Island,
  which launches UI. `/?scene=island` skips straight to gameplay; tests and dev use it. In dev, pressing
  Z three times quickly opens the debug menu (`src/scenes/Debug.ts`: gallery flip, free twigs, and a
  jump to any story beat — the beginning, the orb, beauty is on, ten twigs, fifteen beauty, rum for
  the yarrtender, a cocktail for harry, etarp's cannon). A jump
  builds a fresh world and fast-forwards it with flags, bag, score and where he stands, so whatever
  cutscene was running goes with the world it ran in. Add a beat: one row in `STATES`.
- Cast so far: the main character (he/him, unnamed, says almost nothing), his friend Mich (she/her,
  red hair), Walter (he/him, a crab in a cowboy hat, walks sideways), the tree, which talks once
  woken (`assets/dialogue/tree*.json`; Walter hands over the fashionable carpet before he settles under
  it, in `flower.json`), Etarp (he/him, a blind pirate cursed by an enterprising sea horse, drawn
  facing the wrong way, who runs his ship aground on the salt bridge north, plunders the orb, finds his own boat
  wrecked and hands it back, then goes back to yarrtending: he walks to the top of the north island,
  builds an L of four `bar` pieces (23,2 23,3 22,3 21,3) and stands behind it at 22,2 wanting rum,
  `assets/dialogue/pirate.json`; the rum from the cave across the counter gets `etarp.json`: he spins
  and stands the Otijom on `bar3`; once the sea horse's box shuts he shoves a cannon down the bridge
  to the strip of three grass at the top of the island, stands on the middle one with the cannon
  under him, and after the sea horse recognises his autocannon 9000 and Walter runs for the east
  bridge, it shells the island below for 4 s, charring every grass tile at -3 and wrecking what
  stood there; the sea horse, missed, then walls off the southern crust with 13 cinder blocks along
  row 23 at -10 each and stands four more desalinators on his side that never explode,
  `assets/dialogue/cannon.json`, `src/game/cannon.ts`, `blast` and `wall` in
  `src/game/machine.ts`), golfer's delight (an albatross on the big island who wants ten good twigs for a nest and
  pays with a golden egg, `assets/dialogue/albatross.json`), antoine le shrimp (he/him, a French
  shrimp who farms carrots on the big island's east side from a stool over the one gate in their
  fence; until he asks for a hand the field only reads out (`carrotfield.json`), picking all
  twelve gets his thanks and a request for a chair (`carrots.json`), and one of Harry's deck chairs
  earns the certificate and replaces his stool: that node sets `flags['sprite:shrimp']` to
  `shrimpchair`, and a `sprite:<npc id>` flag draws any npc off the sheet it names,
  `assets/dialogue/shrimp.json`), suspicious harry (he/him, stood over three
  deck chairs on the big island's south shore at 41..43,26; a chair touched before he has had an
  Otijom gets `handsoff.json`, the cocktail sets `harry:ok`, `assets/dialogue/harry.json`), and the sea
  horse (he/him, who swims up to the spit at fifteen beauty and puts his smoking desalinator 9000
  down beside him: it eats a beauty every 2 s, and after five of them it explodes, crusts over every sea
  tile in a disc seven out from it and cuts the box straight to the node its `cut` names, wherever the conversation
  had got to, `src/game/machine.ts` and `assets/dialogue/seahorse.json`). Do not invent further
  characters, names, or backstory.
- No `Math.random` in `src/game`. `world.seed` is the rng: an lcg in `src/game/cannon.ts` the cannon
  draws its targets from, so a run of a scene is the same every time.
- Art is 16x16 tiles on a 640x360 canvas; the world camera is zoomed 2x, UI is 1x. Characters are 16x24
  in the RPG Maker layout: 3 columns (left foot, stand, right foot) x 4 rows (down, left, right, up).

## Feature workflow (what "done" means)

1. Sim first: extend `World`/`Action` in `src/game/`, implement in `apply`, write the unit test.
2. Render: update scenes to draw the new state. Scenes only read `world` and call `dispatch`.
3. If input or UI changed, add or extend an e2e spec using `window.island`.
4. `npm run check` passes. Report in ≤10 lines: files touched, new actions/fields, how to try it (keys).

## Puppet API (`window.island`)

`world()` snapshot · `dispatch(action)` · `load(world)` replace state · `content()` loaded dialogue · `game` the Phaser.Game.
Advance time with `dispatch({ type: 'tick', dt: 3000 })` instead of waiting in tests.

## Code style (non-negotiable)

- KISS. If you're about to add a class, manager, registry, event bus, "system", or service, don't.
  Add a function and a field on `World`.
- No helper until it has 3 call sites. No constants file. A literal with a trailing comment beats a named
  constant used once.
- No barrel `index.ts`. No path aliases. No dependency injection. Mutate `world` in place; no immutability
  or reducer-of-reducers patterns.
- Comments explain *why*, in one line. No doc-comment blocks restating a signature. No section banners.
- Files ≤ 300 lines (lint-enforced). Split by feature (`fishing.ts`), not by layer (`FishingManager.ts`).
- Prefer editing an existing file over creating a new one. Prettier owns formatting: `npm run format`.
- Never run `git checkout`, `git restore`, `git stash`, `git clean`, or `git commit` unless the user asks.
  Uncommitted changes you did not make belong to someone else; leave them. Check with `git status` only.

## Assets and content (non-negotiable)

Hard rule: nothing AI-generated ships. That covers art, animation, UI, VFX, dialogue, names, item
descriptions, and any player-facing text.

- Never create or edit anything under `assets/`. Humans only. The one exception: text the user wrote
  out in chat may be transcribed verbatim into `assets/text/` or `assets/dialogue/`. Never change a
  word, never add lines, and say in the reply that you transcribed it.
- Placeholders live in `placeholder/` and are produced only by `scripts/placeholders.mjs`. A placeholder is a
  silhouette built from a few flat-colour rectangles that reads as the thing: head, body, two legs for a
  person; trunk and canopy for a tree. Two or three flat colours at most. Tiles are single flat fills.
  No outlines, shading, gradients, highlights, noise, texture, faces, or decoration. Do not try to make
  it look good. If it looks like an attempt at art, it is wrong.
- Placeholder text is always wrapped: `[PLACEHOLDER greeting]`, `[PLACEHOLDER NPC NAME]`. Do not write
  dialogue, names, lore, or flavour text, even as "temporary" suggestions, unless explicitly asked.
- Every asset is a sprite sheet described in `src/assets.ts` (frame size, frame order). Adding an asset means
  one manifest entry plus one generator entry in `scripts/placeholders.mjs`. A human replaces it by dropping a
  file at the same path under `assets/`; nothing else changes.
