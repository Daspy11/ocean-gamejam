# Project Island

Cute top-down pixel-art island RPG. Grow the island, talk to people, make choices. Phaser 3 + TypeScript + Vite.

```bash
npm install
npm run dev                       # http://localhost:5173
npm run check                     # typecheck + lint + unit tests
```

Scene flow: rowboat intro → island. `http://localhost:5173/?scene=island` skips straight to gameplay.

The title's **settings** entry contains independent music/SFX switches and a read-only keybind reference. Preferences survive a refresh. SFX includes dialogue voices.

| Action                                | Keyboard / mouse                                     | Standard gamepad                                         |
| ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Move / select                         | Arrows or WASD                                       | D-pad or left stick                                      |
| Confirm / interact / advance dialogue | Enter (including numpad), Space, E, Z, or left click | Bottom face button: A / Cross                            |
| Open / dismiss settings               | Escape, X, or right click                            | Right face button: B / Circle, or Start / Menu / Options |
| Open / close inventory                | I or Tab                                             | Top face button: Y / Triangle                            |
| Run (hold while moving)               | Shift                                                | Right trigger: RT / R2                                   |

Tap a direction to turn; hold it to walk. Confirm finishes typing before advancing a line, selects the current choice, or uses the selected inventory item. Click a menu option to select it directly. Movement uses the keyboard or controller; mouse-only navigation through the world is not implemented.

Settings pauses gameplay, dialogue, timers, camera effects and cutscenes, then resumes where you left off. The title's boat and water keep animating while settings is open. Escape no longer skips the intro or opens inventory. Close settings with the same shortcut or its **close** button.

Gamepads can connect or disconnect during play; press a button to let the browser detect one. Bindings use the standard browser mapping and physical button positions (Nintendo labels may differ). In an embedded player, click the game first to focus it. Press P three times quickly to toggle the development debug menu; Z is always confirm.

Nix, for someone who just wants to play it:

```bash
nix run github:Daspy11/ocean-gamejam        # builds, serves on http://127.0.0.1:8173, opens a browser
nix run github:Daspy11/ocean-gamejam -- 9000  # a different port
```

`nix develop` gives you node 22 and the npm scripts above; `nix build` puts the itch.io build in `result`.

Send it to someone on a Mac (or anywhere): `npm run build:mac` bakes the code and every png,
json and font into one 1.4 MB `dist-mac/Project Island.html`. Double-click it and it plays in Safari
or Chrome off the file — no server, no install, no Gatekeeper prompt. AirDrop or email that one file.

Publish to itch.io: `npm run build` then `butler push dist USER/GAME:html5` (or push to `main` with the
`BUTLER_CREDENTIALS` secret and `ITCH_USER` / `ITCH_GAME` repo variables set). **Set the itch frame to
1280x720** and tick "Fullscreen button": the game is 640x360 and only ever scales by a whole number, so
1280x720 fills the frame exactly at 2x, and fullscreen lands on 3x at 1080p, 4x at 1440p and 6x at 4K.
Any other frame size letterboxes rather than smearing the pixels.

Working on the game with an agent? Read [CLAUDE.md](CLAUDE.md), then `/feature <what you want>`.
