// Keys below are paths relative to assets/ (human-made) and placeholder/ (generated stand-ins).
// resolve() prefers the real file and falls back to the placeholder, so dropping a PNG into
// assets/ at the same path swaps it in with no other change.
export const SHEETS = {
  'tiles/water': { frameWidth: 16, frameHeight: 16 }, // base fill under everything
  'tiles/salt': { frameWidth: 16, frameHeight: 16 }, // 64x64: 4x4 template, see assets/README.md
  'tiles/sand': { frameWidth: 16, frameHeight: 16 }, // 4x4 template, see assets/README.md
  'tiles/grass': { frameWidth: 16, frameHeight: 16 }, // 4x4 template, see assets/README.md
  // One sheet per object kind, named `sprites/<kind>`: footprint comes from KINDS, art is bottom-anchored.
  'sprites/player': { frameWidth: 16, frameHeight: 24 }, // rows down/left/right/up · cols left foot/stand/right foot
  'sprites/mich': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  'sprites/orb': { frameWidth: 16, frameHeight: 16 }, // 0 bare · 1 with a salt crust on top
  'sprites/tree': { frameWidth: 16, frameHeight: 32 }, // 1x1 footprint, bottom-anchored
  'sprites/hut': { frameWidth: 32, frameHeight: 40 }, // 2x2 footprint, bottom-anchored
  'sprites/boat': { frameWidth: 32, frameHeight: 16 }, // 2x1 footprint, also the rowboat in the intro
  'sprites/crate': { frameWidth: 16, frameHeight: 16 }, // 0 closed · 1 open
  'sprites/items': { frameWidth: 16, frameHeight: 16 }, // one frame per item in ITEMS order
} as const

// A terrain sheet is one 4x4 template, so the frame index is no longer the corner mask. Cell
// (row, col) covers the 2x2 window at (row, col) of this corner grid, '1' meaning "this terrain",
// so all 16 combinations appear exactly once and the artist paints one continuous blob:
//   00110 / 00110 / 01100 / 10011 / 11001   (frame = row * 4 + col)
// Index below is the corner mask (TL 1, TR 2, BL 4, BR 8); the value is the frame that draws it.
export const DUAL_FRAME = [0, 7, 14, 9, 13, 3, 8, 6, 4, 10, 1, 15, 11, 12, 5, 2]

export const JSONS = [
  'dialogue/crate',
  'dialogue/firstsalt',
  'dialogue/got',
  'dialogue/inventory1',
  'dialogue/inventory2',
  'dialogue/landing',
  'dialogue/mich',
  'text/items',
  'text/intro',
] as const

export function resolve(file: string): { url: string; placeholder: boolean } {
  // Vite needs these two calls written out literally; it rewrites them at build time. They live in
  // here rather than at module scope so e2e tests can import DUAL_FRAME from this file under node.
  const real = import.meta.glob<string>('/assets/**/*.{png,json}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
  const stand = import.meta.glob<string>('/placeholder/**/*.{png,json}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
  const made = real[`/assets/${file}`]
  if (made) return { url: made, placeholder: false }
  const stub = stand[`/placeholder/${file}`]
  if (stub) return { url: stub, placeholder: true }
  throw new Error(
    `No asset for ${file}: add assets/${file} or an entry in scripts/placeholders.mjs`,
  )
}
