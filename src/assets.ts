// Keys below are paths relative to assets/ (human-made) and placeholder/ (generated stand-ins).
// resolve() prefers the real file and falls back to the placeholder, so dropping a PNG into
// assets/ at the same path swaps it in with no other change.
export const SHEETS = {
  'tiles/terrain': { frameWidth: 16, frameHeight: 16 }, // 0 water · 1 sand · 2 grass
  'sprites/player': { frameWidth: 16, frameHeight: 16 }, // 0 down · 1 up · 2 left · 3 right
  'sprites/objects': { frameWidth: 16, frameHeight: 16 }, // 0 tidepool · 1 stone · 2 npc
} as const

export const JSONS = ['dialogue/npc1'] as const

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
