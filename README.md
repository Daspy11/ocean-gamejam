# Project Island

Cute top-down pixel-art island RPG. Grow the island, talk to people, make choices. Phaser 3 + TypeScript + Vite.

```bash
npm install
npx playwright install chromium   # once, for e2e
npm run dev                       # http://localhost:5173
npm run check                     # typecheck + lint + unit + e2e
```

Scene flow: menu → rowboat intro → island. `http://localhost:5173/?scene=island` skips straight to gameplay.

Keys: arrows / WASD move (tap to turn, hold to walk), Shift run, E / Space / Enter interact, I / Tab / Esc inventory.

Publish to itch.io: `npm run build` then `butler push dist USER/GAME:html5` (or push to `main` with the
`BUTLER_CREDENTIALS` secret and `ITCH_USER` / `ITCH_GAME` repo variables set).

Working on the game with an agent? Read [CLAUDE.md](CLAUDE.md), then `/feature <what you want>`.
