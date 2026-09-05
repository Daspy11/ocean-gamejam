# Project Island

Cute top-down pixel-art island RPG. Grow the island, talk to people, make choices. Phaser 3 + TypeScript + Vite.

```bash
npm install
npx playwright install chromium   # once, for e2e
npm run dev                       # http://localhost:5173
npm run check                     # typecheck + lint + unit + e2e
```

Scene flow: rowboat intro → island. `http://localhost:5173/?scene=island` skips straight to gameplay.

Keys: arrows / WASD move (tap to turn, hold to walk), Shift run, E / Space / Enter interact, I / Tab / Esc inventory.

Publish to itch.io: `npm run build` then `butler push dist USER/GAME:html5` (or push to `main` with the
`BUTLER_CREDENTIALS` secret and `ITCH_USER` / `ITCH_GAME` repo variables set). **Set the itch frame to
1280x720** and tick "Fullscreen button": the game is 640x360 and only ever scales by a whole number, so
1280x720 fills the frame exactly at 2x, and fullscreen lands on 3x at 1080p, 4x at 1440p and 6x at 4K.
Any other frame size letterboxes rather than smearing the pixels.

Working on the game with an agent? Read [CLAUDE.md](CLAUDE.md), then `/feature <what you want>`.
