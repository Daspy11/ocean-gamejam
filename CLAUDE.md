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
  footprint and solidity. Sprites come from `sprites/<kind>`, are bottom-anchored, and are depth-sorted by
  their feet Y, so tall things overlap what's behind them (top-down oblique). To add an object kind: one
  union member, one `KINDS` row, one manifest entry, one placeholder entry.
- Ground is drawn with layered dual-grid autotiling: `tiles/water` is the base, and each higher terrain
  has one 5x3 sheet (a 3x3 island, a 2x2 hole, two diagonals; frame for a corner mask via `DUAL_FRAME`
  in `src/assets.ts`) drawn over whatever is below. One sheet per terrain covers every transition. Adding a terrain: add it to `Tile`,
  the draw order in `Island.ts`, the manifest, the placeholder script, and `assets/README.md`.
- `assets/README.md` is the artist's spec. Keep it true when a sheet layout changes. `?map=gallery`
  renders every tile, transition, object, and character with the real game code.
- Dialogue is data (`Dialogue` json, see `src/game/world.ts`). Current node and choice cursor live in
  `world.dialogue`; the inventory screen's cursor lives in `world.menu`. The UI is stateless, so every
  dialogue path and menu state is testable without Phaser.
- Scripting is data too. A dialogue file may declare `trigger: { event, when? }` and plays once when the
  sim emits that event (`crate:open`, `menu:close`, `salt:spawn`, add more in `apply`) and the `when` flag
  is truthy; it sets `flags['fired:<key>']`. Dialogues that fire while a box is open wait in `world.queue`.
  Node `set` may write strings; `flags['name:<item>']` renames an item. `{item}` in text becomes the name
  of `dialogue.item`. The first pickup of each item plays `got.json`. To add a tutorial beat: write a
  dialogue file with a trigger, and if it needs a new event, emit it from `apply`. No trigger system.
- The infinite-resource loop: the orb placed on a water tile boils the sea and grows a salt crust every
  3 s (`orb` object); salt placed on water becomes a `salt` tile. That is the Skyblock cobblestone
  generator, thematically. The map is ASCII in `src/game/map.ts`; edit it by hand.
- Scene flow: Boot → Menu → Intro (the rowboat cutscene, data in `assets/text/intro.json`) → Island,
  which launches UI. `/?scene=island` skips straight to gameplay; tests and dev use it.
- Cast so far: the main character (he/him, unnamed, says almost nothing) and his friend Mich (she/her,
  red hair). Do not invent further characters, names, or backstory.
- No `Math.random` in `src/game`. If you need randomness, add a seeded rng to `World` first.
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
