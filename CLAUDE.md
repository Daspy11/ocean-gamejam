# Project Island

Cute, wholesome top-down pixel-art RPG for a 14-day jam. Skyblock-style loop: collect stone from tide
pools, place it on water to grow the island, talk to NPCs, make choices that set story flags.
Phaser 3.90 (not 4) + TypeScript + Vite. Ships as HTML5 on itch.io.

## Commands

- `npm run dev` — game at http://localhost:5173
- `npm test` — unit tests (Vitest) for `src/game/**`
- `npm run check` — typecheck + lint + unit tests. **Must pass before you report a task done.**
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
```

## How the game works

- `World` is one plain, JSON-safe object: tiles, player, inventory, objects, flags, dialogue, menu.
  Snapshot with `structuredClone`; save/load will be `JSON.stringify` when we need it.
- Four actions: `tick`, `move` (the held direction changed), `interact`, `menu`. Input becomes actions;
  `apply` mutates `world` in place and bumps `world.rev` on any visible change; scenes resync when `rev`
  moves. Idle ticks and step progress don't bump `rev`.
- Movement follows RPG Maker / Pokémon conventions and lives entirely in the sim: 4-direction grid walking
  at 4.6 tiles/s (Shift runs at 1.5x), no gap between steps while held, tap to turn without moving, direction
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
  (`otijom`). A `cannon` is solid and, once a `fire` act lights it, spits a `ball` every 20 ms for
  4 s, each flying straight out to the left of the muzzle in a 30 degree cone and off the map over
  1500 ms; it breaks nothing, but every third ball drops short and sticks in the ground as an
  `embedded` — a random bare tile down the cone, walked over rather than into, and -3 beauty each. A `cinder` is a solid block;
  nothing stands one any more, so the sheet is spare. A `flyingcarpet` is the one thing
  drawn bigger than its tile, and the one thing drawn off the ground: 32x32 of art centred on the
  1x1 it flies over, so it hangs half a tile over its neighbours, and it and its rider are drawn
  24 px up while it flies. `sprites/shadow` is the faded disc on the ground under it, marking the
  tile it is really on, shrinking as it comes down and gone once it is landed (`landAt` is when it
  started down, and it stays set, so a carpet on the ground has no height and no shadow). A `boat` reads out on interact: `boat.json`, or the `dialogue` it
  names (Etarp's ship reads `ship.json`). Sprites come from `sprites/<kind>`, are bottom-anchored, and are depth-sorted by their feet Y,
  so tall things overlap what's behind them (top-down oblique). To add an object kind: one
  union member, one `KINDS` row, one manifest entry, one placeholder entry.
- Ground is drawn with layered dual-grid autotiling: `tiles/water` is the base, and each higher terrain
  has one 5x3 sheet (a 3x3 island, a 2x2 hole, two diagonals; frame for a corner mask via `DUAL_FRAME`
  in `src/assets.ts`) drawn over whatever is below. A layer's mask counts any terrain above it as itself,
  so a rounded corner reveals the terrain below and never water. One sheet per terrain covers every
  transition. `rock` is the top layer and the only solid one: everything but water and rock is
  walked on. `charred` sits just over grass; nothing lays it any more (the cannon used to), so the sheet is spare.
  Adding a terrain: add it to `Tile`, the draw order in `Island.ts`, the manifest, the
  placeholder script, and `assets/README.md`.
- `assets/README.md` is the artist's spec. Keep it true when a sheet layout changes. `?map=gallery`
  renders every tile, transition, object, and character with the real game code.
- Dialogue is data (`Dialogue` json, see `src/game/world.ts`). Current node and choice cursor live in
  `world.dialogue`; the inventory screen's cursor lives in `world.menu`. The UI is stateless, so every
  dialogue path and menu state is testable without Phaser.
- Scripting is data too. A dialogue file may declare `trigger: { event, when? }` and plays once when the
  sim emits that event (`crate:open` (a crate opened, or the orb picked up off the sand), `menu:close`, `salt:spawn`, `salt:place`, `talk:<npc id>`,
  `tree:shake:<n>`, `tree:near`, `score:negative`, `arrive:north`, `salt:away` (any item put down off
  the main island), `score:fifteen`, `done:<dialogue key>` (that box has just
  closed), add more in `apply`) and the `when` flag is
  truthy and the `unless` flag is not (`negative.json` is dead once the sea horse has been met); it
  sets `flags['fired:<key>']`. A `start` or `next` entry may also need items: `has: { twig: 10 }`, or the
  player stood in a rect of tiles: `in: { x, y, w, h }`.
  Dialogues that fire while a box is open wait in
  `world.queue`. Node `set` may write strings; `flags['name:<item>']` renames an item; node `take`
  spends an item (or the counts in a record: `{ twig: 10 }`); node `give` hands one over, got box and
  all: the box cuts in right after that line and the rest of the talk resumes behind it
  (`dialogue.back`), or plays once the talk is over when that line was the last. `{item}` in text
  becomes the name of `dialogue.item`; `{score}` the beauty score. The first
  pickup of each item plays `got.json`. To add a tutorial beat: write a dialogue file with a trigger,
  and if it needs a new event, emit it from `apply`. No trigger system.
- Cutscenes are dialogue nodes without `text` (acts): `walk` an npc to a tile, `wait` ms, `spawn` an
  object, `put` one down on the nearest free ground beside somebody (`src/game/machine.ts`), `bloom` a
  flower, `shake` / `fly` / `land` a tree (`src/game/tree.ts`), `rumble` the screen, `spin` an npc
  (2 s of quarter turns every 50 ms, then back to how he faced, `src/game/boat.ts`), `drink` (a
  cocktail stood on the `bar` it names), `fire` a cannon at the sea horse for 4 s of noise
  (`src/game/cannon.ts`), `face` (turns an npc on the spot, for one riding something and unable to
  walk), `throw` (the player walks to the first object of that `kind` standing on the island, picks
  it up and hucks it at the npc `at`; only the golden egg does anything — it knocks Tarq off his
  carpet: he is flung two tiles to the right and lands face down there (`thrown` is the tile he
  left and when, the same field a thrown thing arcs over on), and the carpet wafts down over 3 s,
  swinging side to side, and is worth 200 beauty where it lands, `src/game/throw.ts`),
  `closeup` (the screen goes
  black and a sheet's frames play big in the middle, `world.closeup`, drawn by the UI scene and
  down again when the box closes, or at a `closeup: null`; with `burst: true` there is no black:
  the camera eases 1 s onto the npc drawn off that sheet under shooting stars, as far in as `zoom`
  asks (7.5x by default, and a second close-up on the same npc punches straight to its own zoom), a `burst` act
  then shakes him white and apart into stars for 2 s, and `closeup: null` eases it back out
  over 1 s (`down`), Walter's entry in `flower.json`), `clear` (the box hides and the player is free to walk; the act
  is over once he stands outside its rect), and `gone`, which
  just holds until the object it names has left the world. The box hides, the act runs, and the node
  advances itself. A walk naming `player` walks the player himself, the same A* and the same steps,
  with his path on `world.player` (`walkPlayer` in `src/game/boat.ts`); he is carried the same way
  too, by `player.ride`. A walk with `to` finds its way by A* (`src/game/path.ts`): who can cross what is
  `MODES` there, keyed by sprite (a flyer is stopped only by another flyer, a swimmer by rock, solid
  objects and anyone on the ground, a walker by water too); another character is crossed only when
  there is no other way, the player being the one to push past first; and no way at all means he
  stays put and the act is over; somebody standing on the tile means he ends on the closest free
  tile he can reach and turns to face him; `facing` turns him that way once he is there. A walk
  with `push` shoves an object along: it goes the step ahead of him the whole way, round every
  corner and through anything, swings out on his last step to where he will be facing, and is
  left there in front of him. A walk
  with `path` is the exact steps, through everything: a boat sails that way, and stops `wrecked`
  when its next tile is not water (`src/game/boat.ts`). An npc with `ride` sits on the object it
  names. A walk with `near` walks up to something — an object id, or `player` — using its tile as
  the `to`, so a character is faced from beside him as above, and a solid thing like a boat is
  stopped at on the tile before it. See `assets/dialogue/flower.json` and `pirate.json`.
- The island grows by the orb, which starts as `orb1` lying in the sand at 13,15 where the crash threw
  it (interact picks it up, and that first pickup is the tutorial beat, `crate:open`): thrown on a water tile it boils it (smoke) and after 2 s that tile is
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
  it). A bloomed flower is +10, a `floor` +5, Tarq's carpet on the ground +200, placing salt is -1,
  but only on the main island:
  `world.main` is flood-filled from the spawn when the world is made and grows through salt laid next
  to it, and the desalinator's blast joins its whole crust (`blast` in `src/game/machine.ts`). Anything put down anywhere else counts for nothing and fires `salt:away` (Walter's reminder in
  `assets/dialogue/away.json`) instead of `salt:place`. `world.pops` are the floating +N/-N.
- The Outro (`src/scenes/Outro.ts`) is the last scene, and the island hands over to it without a cut:
  Island sees `flags['outro']` and runs `flyOut` (`src/scenes/leave.ts`), which stops the camera
  following, drops a sea tilesprite past the map's east edge and slides the carpet, its riders and
  the camera 34 tiles east over 3.2 s, accelerating; then it stops UI and starts the Outro. The Outro
  opens at the island's 2x on the same sea running at the same speed and eases to 3x over 1.8 s, so
  the join is one continuous shot. Then the two of them fly on (with Walter on Mich's head if
  `flags['walter:aboard']`), the player looks over at her and leans in, one small heart drifts up
  between them, and a spotlight closes on the party into the credits. The names fade up a
  pair at a time, then two cards ("thanks for playing", "our first game") each hold 4 s or until
  Enter, the black holds 4 s on its own, and "Play again?" comes up with a chevron: Enter there
  loads a fresh `createWorld()` and starts the Intro again. Otherwise it reads `world` and changes
  nothing.
- Scene flow: Boot → Intro (the rowboat cutscene, data in `assets/text/intro.json`; it opens on the
  sea and waits for a press before the first line) → Island,
  which launches UI. Intro starts it with `{ crash: true }`, and the crash itself plays there
  (`src/scenes/crash.ts`): the boat flies in flat from the west, slams onto the shore and the orb,
  Mich and the player are all thrown out of it, somersaulting onto the tiles they spawn on, and only
  then does `landing.json` open. All tweens over a world that already has them ashore; the sim
  knows nothing about it. `flipOff` in the same file draws any npc stepping off a boat that has
  just been wrecked as that same somersault, so Etarp comes off his ship the way they come off theirs.
  `/?scene=island` skips straight to gameplay; tests and dev use it. In dev, pressing
  Z three times quickly opens the debug menu (`src/scenes/Debug.ts`: gallery flip, free twigs, and a
  jump to any story beat — the beginning, the orb, beauty is on, ten twigs, etarp's arrival, fifteen
  beauty, rum for the yarrtender, a cocktail for harry, etarp's cannon, tarq flies in, leaving the
  island). A jump
  builds a fresh world and fast-forwards it with flags, bag, score and where he stands, so whatever
  cutscene was running goes with the world it ran in. Add a beat: one row in `STATES`.
- Cast so far: the main character (he/him, unnamed, says almost nothing), his friend Mich (she/her,
  red hair), Walter (he/him, a crab in a cowboy hat, walks sideways), the tree, which talks once
  woken (`assets/dialogue/tree*.json`; Walter hands over the fashionable carpet before he settles under
  it, in `flower.json`), Etarp (he/him, a blind pirate cursed by an evil sea horse, drawn
  facing the wrong way, who runs his ship aground on the salt bridge north, plunders the orb, finds his own boat
  wrecked and hands it back, then goes back to yarrtending: he walks to the top of the north island,
  builds an L of four `bar` pieces (23,2 23,3 22,3 21,3) and stands behind it at 22,2 wanting rum,
  `assets/dialogue/pirate.json`; the rum from the cave across the counter gets `etarp.json`: he spins
  and stands the Otijom on `bar3`; once the sea horse's box shuts he shoves a cannon down the bridge
  to the island's west side (A* down whatever bridge the player built, to the grass at 19,15 facing
  left, so the cannon swings out in front of him at 18,15, opposite the sea horse across the island),
  and after the sea horse recognises his autocannon 9000 and Walter steps two tiles clear
  (and, if the player is stood in the line of fire, 14..17 on row 15, asks him
  out of it and the scene waits until he is; Mich steps a tile south as the scene opens, so the
  cannon does not come to rest on her), it fires at him across the island for 4 s and hits nothing, leaving only the
  balls stuck in the ground behind it; the sea horse, missed, gives him that half of the island and the scene ends there,
  `assets/dialogue/cannon.json`, `src/game/cannon.ts`, `blast` in `src/game/machine.ts`), golfer's delight (an albatross on the big island who wants ten good twigs for a nest and
  pays with a golden egg, `assets/dialogue/albatross.json`), antoine le shrimp (he/him, a French
  shrimp who farms carrots on the big island's east side from a stool over the one gate in their
  fence; until he asks for a hand the field only reads out (`carrotfield.json`), handing him all
  twelve across his gate (a `has` branch of his own file that spends them) gets his thanks and a request for a chair, and one of Harry's deck chairs
  earns the certificate and replaces his stool: that node sets `flags['sprite:shrimp']` to
  `shrimpchair`, and a `sprite:<npc id>` flag draws any npc off the sheet it names,
  `assets/dialogue/shrimp.json`), suspicious harry (he/him, stood over three
  deck chairs on the big island's south shore at 41..43,26; a chair touched before he has had an
  Otijom gets `handsoff.json`, the cocktail sets `harry:ok`, `assets/dialogue/harry.json`), and the sea
  horse (he/him, who swims in from the west at fifteen beauty onto the sand at 13,15, the
  tile above the wreck where the orb lay, and puts his smoking desalinator 9000 down on
  the sand above him at 13,14: it eats a beauty every 2 s, and after five of them it explodes, crusts over every sea
  tile in a disc seven out from it and cuts the box straight to the node its `cut` names, wherever the conversation
  had got to, `src/game/machine.ts` and `assets/dialogue/seahorse.json`), and Lord Tarqualius
  ("Tarq", whose orb it was, and the last scene in the game: 5 s after the cannon scene closes he flies in from the west edge on a
  `flyingcarpet` he rides along row 17, crosses the whole island and turns back on them from the
  east shore at 20,17; Mich comes down off her flower to 18,17 to face him two tiles away, he
  closes to 19,17 as he asks, she backs off west across the crust to 12,17, and he presses on to
  18,17. At her word the player picks a thing off the island and throws it at him. Only the golden egg does
  anything: he is knocked two tiles to his left and lies face down there, the carpet wafts to the
  ground for +200, and a second later he says his last line. Mich then takes the carpet off him:
  Walter comes over to admire it and asks to come along (a yes/no that sulks its way through two
  more close-ups before he gives up), and once he is either on Mich's head or left behind, she and
  the player get aboard, Etarp and the sea horse open fire, and the carpet flies off east and sets
  `flags['outro']`. `assets/dialogue/tarq.json`, `src/game/throw.ts`. `sprites/serious` is spare now that Walter no longer steps in). Do not invent further
  characters, names, or backstory.
- No `Math.random` in `src/game`. `world.seed` is the rng: an lcg in `src/game/cannon.ts` the cannon
  draws its ball angles from, so a run of a scene is the same every time.
- Art is 16x16 tiles on a 640x360 canvas; the world camera is zoomed 2x, UI is 1x. Characters are 16x24
  in the RPG Maker layout: 4 columns (left foot, passing, right foot, passing) x 4 rows (down, left,
  right, up). The two passing columns are the same stand pose, alternating with the feet as he walks.

## Feature workflow (what "done" means)

1. Sim first: extend `World`/`Action` in `src/game/`, implement in `apply`, write the unit test.
2. Render: update scenes to draw the new state. Scenes only read `world` and call `dispatch`.
3. `npm run check` passes. Report in ≤10 lines: files touched, new actions/fields, how to try it (keys).

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
