// Keys below are paths relative to assets/ (human-made) and placeholder/ (generated stand-ins).
// resolve() prefers the real file and falls back to the placeholder, so dropping a PNG into
// assets/ at the same path swaps it in with no other change.
export const SHEETS = {
  'tiles/water': { frameWidth: 16, frameHeight: 16 }, // base fill under everything
  'tiles/salt': { frameWidth: 16, frameHeight: 16 }, // 16 dual-grid frames, index = corner mask TL1 TR2 BL4 BR8, 0 empty, 15 full
  'tiles/sand': { frameWidth: 16, frameHeight: 16 }, // same
  'tiles/grass': { frameWidth: 16, frameHeight: 16 }, // same
  // One sheet per object kind, named `sprites/<kind>`: footprint comes from KINDS, art is bottom-anchored.
  'sprites/player': { frameWidth: 16, frameHeight: 24 }, // rows down/up/left/right · cols stand/left foot/right foot
  'sprites/mich': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  'sprites/orb': { frameWidth: 16, frameHeight: 16 }, // 0 bare · 1 with a salt crust on top
  'sprites/tree': { frameWidth: 16, frameHeight: 32 }, // 1x1 footprint, bottom-anchored
  'sprites/hut': { frameWidth: 32, frameHeight: 40 }, // 2x2 footprint, bottom-anchored
  'sprites/boat': { frameWidth: 32, frameHeight: 16 }, // 2x1 footprint, also the rowboat in the intro
  'sprites/crate': { frameWidth: 16, frameHeight: 16 }, // 0 closed · 1 open
  'sprites/items': { frameWidth: 16, frameHeight: 16 }, // one frame per item in ITEMS order
} as const

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

// Vite needs these two calls written out literally; it rewrites them at build time.
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

export function resolve(file: string): { url: string; placeholder: boolean } {
  const made = real[`/assets/${file}`]
  if (made) return { url: made, placeholder: false }
  const stub = stand[`/placeholder/${file}`]
  if (stub) return { url: stub, placeholder: true }
  throw new Error(
    `No asset for ${file}: add assets/${file} or an entry in scripts/placeholders.mjs`,
  )
}
