---
name: feature
description: Implement a gameplay feature end to end (sim, unit tests, render, check).
---

Implement the feature described in $ARGUMENTS, following AGENTS.md.

1. Read `src/game/world.ts` and `src/game/actions.ts`. Decide the smallest change to `World` / `Action`.
2. Write the unit test first in `src/game/*.test.ts`, then implement in `apply`.
3. Update `src/scenes/` only as needed to draw the new state or map new input to actions.
4. Run `npm run check`; fix until green.
5. Reply with: files touched, new or changed actions and `World` fields, and how to try it in the browser (keys).

Do not add abstractions, managers, or helper files. Do not touch `assets/`. Placeholder art only via
`scripts/placeholders.mjs` (flat rectangles), placeholder text only as `[PLACEHOLDER ...]`.
