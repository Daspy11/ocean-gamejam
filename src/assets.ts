// Keys below are paths relative to assets/ (human-made) and placeholder/ (generated stand-ins).
// resolve() prefers the real file and falls back to the placeholder, so dropping a PNG into
// assets/ at the same path swaps it in with no other change.
export const SHEETS = {
  'tiles/water': { frameWidth: 16, frameHeight: 16 }, // base fill under everything
  'tiles/salt': { frameWidth: 16, frameHeight: 16 }, // 80x48: 5x3 terrain layout, see assets/README.md
  'tiles/sand': { frameWidth: 16, frameHeight: 16 }, // 5x3 terrain layout, see assets/README.md
  'tiles/grass': { frameWidth: 16, frameHeight: 16 }, // 5x3 terrain layout, see assets/README.md
  'tiles/charred': { frameWidth: 16, frameHeight: 16 }, // 5x3 terrain layout: grass the cannon burnt
  'tiles/farm': { frameWidth: 16, frameHeight: 16 }, // 5x3 terrain layout, see assets/README.md
  'tiles/rock': { frameWidth: 16, frameHeight: 16 }, // 5x3 terrain layout, see assets/README.md
  // One sheet per object kind, named `sprites/<kind>`: footprint comes from KINDS, art is bottom-anchored.
  'sprites/player': { frameWidth: 16, frameHeight: 24 }, // rows down/left/right/up · cols left foot/stand/right foot
  'sprites/mich': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  // character sheet layout; the crab only ever walks sideways, so the left/right rows are the walk
  // and the down row is how he stands
  'sprites/walter': { frameWidth: 16, frameHeight: 24 },
  // character sheet; the blind pirate is drawn on the row opposite the way he is facing
  'sprites/etarp': { frameWidth: 16, frameHeight: 24 },
  'sprites/albatross': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  // character sheet; he never gets off his stool, so all twelve frames are the same seated pose
  'sprites/shrimp': { frameWidth: 16, frameHeight: 24 },
  // character sheet; the same seated pose on the deck chair he swaps the stool for
  'sprites/shrimpchair': { frameWidth: 16, frameHeight: 24 },
  'sprites/seahorse': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  'sprites/harry': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  'sprites/tarq': { frameWidth: 16, frameHeight: 24 }, // character sheet, same layout as player
  'sprites/orb': { frameWidth: 16, frameHeight: 16 }, // one frame: the bare orb
  'sprites/smoke': { frameWidth: 16, frameHeight: 16 }, // 3 frames cycled over an orb still boiling its tile
  'sprites/tree': { frameWidth: 16, frameHeight: 32 }, // 1x1 footprint, bottom-anchored
  // 2x1 footprint, also the rowboat in the intro: 0 whole · 1 smashed in at the bow (its left end)
  'sprites/boat': { frameWidth: 32, frameHeight: 16 },
  'sprites/crate': { frameWidth: 16, frameHeight: 16 }, // 0 closed · 1 open
  'sprites/flower': { frameWidth: 16, frameHeight: 16 }, // 0 the flower · 1 gone white
  'sprites/sign': { frameWidth: 16, frameHeight: 16 }, // 1x1 footprint: a post with a board
  // one frame, bottom-anchored on its 1x1 tile: a rock hump standing higher than the ground
  'sprites/cave': { frameWidth: 16, frameHeight: 32 },
  'sprites/rum': { frameWidth: 16, frameHeight: 16 }, // one frame: the bottle, stood on its tile
  'sprites/bar': { frameWidth: 16, frameHeight: 16 }, // 0 a piece of counter · 1 with a cocktail stood on it
  'sprites/gate': { frameWidth: 16, frameHeight: 16 }, // one frame: the locked gate, filling the tile
  'sprites/chair': { frameWidth: 16, frameHeight: 16 }, // one frame: a deck chair
  'sprites/carrot': { frameWidth: 16, frameHeight: 16 }, // one frame: a carrot growing in the soil
  'sprites/machine': { frameWidth: 16, frameHeight: 16 }, // one frame: the desalinator 9000
  'sprites/fence': { frameWidth: 16, frameHeight: 16 }, // one frame: a post with a rail across it
  'sprites/floor': { frameWidth: 16, frameHeight: 16 }, // one frame: the carpet, lying flat on its tile
  'sprites/egg': { frameWidth: 16, frameHeight: 16 }, // one frame: the golden egg, stood on its tile
  'sprites/certificate': { frameWidth: 16, frameHeight: 16 }, // one frame: the award, propped on its tile
  'sprites/cannon': { frameWidth: 16, frameHeight: 16 }, // one frame: barrel over the block it sits on
  'sprites/ball': { frameWidth: 16, frameHeight: 16 }, // one white frame, tinted red to white in flight
  'sprites/cinder': { frameWidth: 16, frameHeight: 16 }, // one frame: a block of the sea horse's wall
  'sprites/flyingcarpet': { frameWidth: 16, frameHeight: 16 }, // one frame: Tarq's carpet, lying flat
  // 4 frames of 16x24 for the close-up, drawn 7.5x: Walter as he stands, his hat lifted off, the hat
  // gone and a barrel coming out, and the minigun out across him
  'sprites/serious': { frameWidth: 16, frameHeight: 24 },
  'sprites/items': { frameWidth: 16, frameHeight: 16 }, // one frame per item in ITEMS order
  // one frame, drawn as a nine-slice: the four 8x8 corners are pinned and the middle column and
  // row are stretched to whatever size the box is, so keep those flat along the way they stretch
  'ui/box': { frameWidth: 24, frameHeight: 24 },
} as const

// A terrain sheet is 5x3 frames laid out as three pictures the artist paints whole. Each number is
// the corner mask that frame draws (TL 1, TR 2, BL 4, BR 8); frame = row * 5 + col:
//   [ 8][12][ 4]  [ 7][11]     cols 0..2: a 3x3 island, solid in the middle, edges and corners around
//   [10][15][ 5]  [13][14]     cols 3..4, rows 0..1: a 2x2 block with a hole, the four inner corners
//   [ 2][ 3][ 1]  [ 6][ 9]     cols 3..4, row 2: the two diagonals
// Index below is the corner mask; the value is the frame. Mask 0 is nothing of this terrain, so it
// has no frame: -1 leaves the tilemap cell empty.
export const DUAL_FRAME = [-1, 12, 10, 11, 2, 7, 13, 3, 0, 14, 5, 4, 1, 8, 9, 6]

export const JSONS = [
  'dialogue/albatross',
  'dialogue/away',
  'dialogue/bigtree',
  'dialogue/boat',
  'dialogue/cannon',
  'dialogue/carrotfield',
  'dialogue/carrots',
  'dialogue/crate',
  'dialogue/etarp',
  'dialogue/firstsalt',
  'dialogue/flower',
  'dialogue/gate',
  'dialogue/got',
  'dialogue/handsoff',
  'dialogue/harry',
  'dialogue/insalting',
  'dialogue/inventory1',
  'dialogue/inventory2',
  'dialogue/landing',
  'dialogue/mich',
  'dialogue/negative',
  'dialogue/pirate',
  'dialogue/seahorse',
  'dialogue/shake3',
  'dialogue/shake7',
  'dialogue/shrimp',
  'dialogue/sign',
  'dialogue/tarq',
  'dialogue/tree',
  'dialogue/tree2',
  'dialogue/treealive',
  'dialogue/treefriend',
  'dialogue/walter',
  'text/items',
  'text/intro',
] as const

export function resolve(file: string): { url: string; placeholder: boolean } {
  // Vite needs these two calls written out literally; it rewrites them at build time. They live in
  // here rather than at module scope so e2e tests can import DUAL_FRAME from this file under node.
  // ttf only on this side: there is no stand-in font, assets/fonts/*.ttf have to be there
  const real = import.meta.glob<string>('/assets/**/*.{png,json,ttf}', {
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
