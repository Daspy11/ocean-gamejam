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

- `World` is one plain, JSON-safe object: tiles, player, inventory, tidepools, npcs, flags, dialogue.
  Snapshot with `structuredClone`; save/load will be `JSON.stringify` when we need it.
- Three actions: `tick`, `move`, `interact`. Input becomes actions; `apply` mutates `world` in place and
  bumps `world.rev` on any visible change; scenes resync when `rev` moves. Idle ticks don't bump `rev`.
- Movement is tile-grid. World coordinates are tiles; scenes multiply by 16.
- Dialogue is data (`Dialogue` json, see `src/game/world.ts`). Current node and choice cursor live in
  `world.dialogue`, so the UI is stateless and every dialogue path is testable without Phaser.
- No `Math.random` in `src/game`. If you need randomness, add a seeded rng to `World` first.
- Art is 16x16 tiles on a 640x360 canvas; the world camera is zoomed 2x, UI is 1x.

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

## Assets and content (non-negotiable)

Hard rule: nothing AI-generated ships. That covers art, animation, UI, VFX, dialogue, names, item
descriptions, and any player-facing text.

- Never create or edit anything under `assets/`. Humans only.
- Placeholders live in `placeholder/` and are produced only by `scripts/placeholders.mjs`. A placeholder is a
  flat solid-colour rectangle. No outlines, shading, gradients, highlights, noise, texture, faces, or
  decoration. The only allowed marking is one the gameplay needs (e.g. a bar on the edge the player faces).
  Do not try to make it look good. If it looks like an attempt at art, it is wrong.
- Placeholder text is always wrapped: `[PLACEHOLDER greeting]`, `[PLACEHOLDER NPC NAME]`. Do not write
  dialogue, names, lore, or flavour text, even as "temporary" suggestions, unless explicitly asked.
- Every asset is a sprite sheet described in `src/assets.ts` (frame size, frame order). Adding an asset means
  one manifest entry plus one generator entry in `scripts/placeholders.mjs`. A human replaces it by dropping a
  file at the same path under `assets/`; nothing else changes.
