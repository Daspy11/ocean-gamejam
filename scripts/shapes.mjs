// The shapes the sheets in placeholders.mjs are drawn from: the terrain template, the character
// layouts, and whatever else is too long to sit in the sheets list there. Flat solid fills only, two or three colours, no outlines or shading.
// The 5x3 terrain sheet: each entry is the corner mask its frame draws (TL 1, TR 2, BL 4, BR 8).
// Left, a 3x3 island; right, a 2x2 block with a hole and, under it, the two diagonals. Must match
// DUAL_FRAME in src/assets.ts.
const LAYOUT = [
  [8, 12, 4, 7, 11],
  [10, 15, 5, 13, 14],
  [2, 3, 1, 6, 9],
]

// So an 80x48 terrain sheet fills the quadrants whose corner is on, and the placeholder file *is*
// the picture the artist paints over: an island, a hole, two diagonals, every corner case once. The
// quadrant corners at the cell centre are rounded so the autotiling actually reads in game.
export const dual = (colour) =>
  LAYOUT.flat().map((mask) => {
    // quadrant order is top-left, top-right, bottom-left, bottom-right
    const on = [1, 2, 4, 8].map((bit) => (mask & bit) !== 0)
    const corners = on.filter(Boolean).length
    return (x, y) => {
      if (corners === 4) return colour
      const q = (y < 8 ? 0 : 2) + (x < 8 ? 0 : 1)
      // two adjacent corners is a straight edge: keep it flat so it continues across cells
      if (corners === 2 && on[0] !== on[3]) return on[q] ? colour : null
      // the 4x4 square this quadrant touches the cell centre with, and that square's outer corner
      const sx = x < 8 ? 4 : 8
      const sy = y < 8 ? 4 : 8
      const round =
        x >= sx &&
        x < sx + 4 &&
        y >= sy &&
        y < sy + 4 &&
        Math.hypot(x + 0.5 - (x < 8 ? 4 : 12), y + 0.5 - (y < 8 ? 4 : 12)) > 4
      // a lone quadrant loses that arc (a rounded tip); a lone gap gains it (an inner fillet)
      return (corners === 3 ? on[q] || round : on[q] && !round) ? colour : null
    }
  })

// Character sheet: 3 columns (left foot, stand, right foot) x 4 rows (down, left, right, up). Facing
// reads from where the hair sits; the two walk columns only shorten one leg by a pixel.
export const character = ({ hair, skin, shirt }) =>
  [
    {
      // down: hair cap, face, body
      body: [
        [4, 1, 8, 3, hair],
        [4, 4, 8, 5, skin],
        [3, 9, 10, 9, shirt],
      ],
      legs: [4, 9],
    },
    {
      // left: back of the head on the right, face on the left
      body: [
        [5, 1, 7, 3, hair],
        [9, 4, 3, 5, hair],
        [5, 4, 4, 5, skin],
        [4, 9, 8, 9, shirt],
      ],
      legs: [5, 8],
    },
    {
      // right: the mirror of left
      body: [
        [4, 1, 7, 3, hair],
        [4, 4, 3, 5, hair],
        [7, 4, 4, 5, skin],
        [4, 9, 8, 9, shirt],
      ],
      legs: [5, 8],
    },
    {
      // up: the hair covers the whole head
      body: [
        [4, 1, 8, 8, hair],
        [3, 9, 10, 9, shirt],
      ],
      legs: [4, 9],
    },
  ].flatMap(({ body, legs }) =>
    [
      [5, 6], // left foot forward
      [6, 6], // stand
      [6, 5], // right foot forward
    ].map(([a, b]) => [...body, [legs[0], 18, 3, a, skin], [legs[1], 18, 3, b, skin]]),
  )

// Walter's sheet, in the same 3x4 character layout. A crab looks much the same from every side, so
// all four rows share one picture; the walk columns lift alternate legs a pixel so the walk reads.
// The shrimp farmer, in the same 3x4 character layout. He never gets off his seat, so every frame
// is the same seated pose: a pink curl on a brown stool, feet clear of the ground, or on the red
// deck chair once he has one, the chair sheet's picture sat in the lower 16 rows of the frame
export const shrimp = (deckchair = false) => {
  const pink = '#e2808f'
  const wood = '#7a5a3a'
  const seat = deckchair
    ? chair.map(([x, y, w, h, c]) => [x, y + 8, w, h, c])
    : [
        [5, 18, 2, 6, wood], // stool legs
        [9, 18, 2, 6, wood],
        [3, 16, 10, 2, wood], // seat
      ]
  const sat = [
    ...seat,
    [4, 5, 8, 11, pink], // body, curled forward over it
    [3, 12, 3, 4, pink], // tail
  ]
  return Array.from({ length: 12 }, () => sat)
}

// Walter's close-up, four frames of 16x24 drawn big: as he stands, the hat lifted off, the hat gone
// and a barrel poking out, and the minigun out across him. Rudimentary on purpose.
export const serious = () => {
  const red = '#c8402a'
  const brown = '#7a5a3a'
  const grey = '#5a5a66'
  const body = [
    [4, 10, 2, 2, red], // eye stalks
    [10, 10, 2, 2, red],
    [2, 12, 12, 6, red], // body
    ...[2, 5, 9, 12].map((x) => [x, 18, 2, 3, red]),
  ]
  const hat = (dy) => [
    [1, 8 + dy, 14, 2, brown],
    [5, 4 + dy, 6, 4, brown],
  ]
  return [
    [...hat(0), ...body],
    [...hat(-4), ...body],
    [...body, [11, 13, 5, 3, grey]],
    [...body, [0, 12, 16, 4, grey], [12, 11, 4, 6, grey]],
  ]
}

// the golden egg, the shrimp welfare award and Tarq's flying carpet, one 16x16 frame each
export const egg = [
  [5, 3, 6, 11, '#e0c040'], // an oval, two overlapping rects
  [4, 5, 8, 7, '#e0c040'],
]
export const certificate = [
  [2, 3, 12, 12, '#f0e8d0'], // the paper
  [9, 10, 3, 3, '#c04040'], // its seal
]
export const flyingcarpet = [
  [1, 6, 14, 8, '#8a3a8a'], // the carpet, lying flat
  [0, 8, 1, 4, '#e0c040'], // a tassel each end
  [15, 8, 1, 4, '#e0c040'],
]

export const crab = () => {
  const red = '#c8402a'
  const brown = '#7a5a3a'
  const body = [
    [1, 8, 14, 2, brown], // hat brim
    [5, 4, 6, 4, brown], // crown
    [4, 10, 2, 2, red], // eye stalks
    [10, 10, 2, 2, red],
    [2, 12, 12, 6, red], // body
  ]
  const legs = [2, 5, 9, 12]
  return [0, 1, 2, 3].flatMap(() =>
    [0, 1, 2].map((col) => [
      ...body,
      ...legs.map((x, i) => [x, col !== 1 && i % 2 === (col ? 1 : 0) ? 17 : 18, 2, 3, red]),
    ]),
  )
}

// The albatross, in the same 3x4 character layout: a white body with one dark folded wing. The beak
// is what says which way he is looking, so the up row has none at all.
export const bird = () => {
  const white = '#f0f0f0'
  const wing = '#404048'
  const beak = '#e0b040'
  const body = [
    [4, 2, 8, 6, white], // head
    [3, 8, 10, 10, white], // body
    [4, 11, 8, 5, wing], // folded wing
  ]
  const beaks = [
    [6, 7, 4, 2], // down: under the head
    [2, 5, 3, 2], // left
    [11, 5, 3, 2], // right
    null, // up: he is facing away
  ]
  return beaks.flatMap((point) =>
    [
      [5, 6], // left foot forward
      [6, 6], // stand
      [6, 5], // right foot forward
    ].map(([a, b]) => [
      ...body,
      ...(point ? [[...point, beak]] : []),
      [5, 18, 3, a, beak],
      [9, 18, 3, b, beak],
    ]),
  )
}

// Etarp's counter: a wooden front under a slab of top, the full width of the tile so the pieces
// join up. Frame 0 bare, frame 1 with a cocktail stood on it.
const counter = [
  [0, 6, 16, 10, '#7a5a3a'], // the front
  [0, 4, 16, 3, '#a08050'], // the top
]
export const bar = [counter, [...counter, [6, 0, 4, 5, '#a0e0c0']]]

// the locked gate: two posts and two rails filling the tile
export const gate = [
  [1, 1, 3, 15, '#7a5a3a'],
  [12, 1, 3, 15, '#7a5a3a'],
  [1, 4, 14, 2, '#7a5a3a'],
  [1, 10, 14, 2, '#7a5a3a'],
]

// a deck chair: canvas back and seat on two wooden legs; also its own icon in the items sheet
export const chair = [
  [3, 1, 10, 7, '#c04040'],
  [2, 8, 12, 4, '#c04040'],
  [3, 12, 2, 4, '#7a5a3a'],
  [11, 12, 2, 4, '#7a5a3a'],
]

// the bottle of rum: dark glass with a cork; also its own icon in the items sheet
export const bottle = [
  [6, 6, 4, 10, '#3a5a3a'],
  [7, 2, 2, 4, '#3a5a3a'],
  [7, 1, 2, 1, '#a08050'],
]

// the inventory icons, one per item in ITEMS order (src/game/world.ts)
export const items = [
  [
    [3, 9, 10, 4, '#c4ccd6'],
    [5, 6, 6, 3, '#c4ccd6'],
  ], // 0 salt, a pile
  [
    [5, 3, 6, 10, '#e07020'],
    [3, 5, 10, 6, '#e07020'],
  ], // 1 orb, as frame 0 of orb.png
  [
    [6, 3, 4, 3, '#8a7050'],
    [4, 6, 8, 8, '#c8b088'],
  ], // 2 electrolytes, a bag with a tied neck
  [
    [3, 10, 10, 2, '#7a5a3a'],
    [9, 6, 2, 5, '#7a5a3a'],
  ], // 3 twig, a stick with one shoot
  [
    [4, 6, 8, 7, '#9aa0a8'],
    [5, 4, 6, 4, '#9aa0a8'],
  ], // 4 seal, a blob with a head
  [
    [5, 4, 6, 9, '#e0c040'],
    [4, 6, 8, 5, '#e0c040'],
  ], // 5 egg
  [
    [6, 7, 4, 7, '#e08030'],
    [7, 12, 2, 3, '#e08030'],
    [5, 3, 6, 4, '#3f7f3f'],
  ], // 6 carrot, as the sprite
  [
    [2, 3, 12, 10, '#e8e4d8'],
    [9, 9, 4, 4, '#c04040'],
  ], // 7 certificate, a pale sheet with a seal on it
  [[3, 4, 10, 8, '#8a4a5a']], // 8 carpet, a square of rug
  [
    [3, 6, 5, 5, '#e0c040'],
    [7, 8, 7, 2, '#e0c040'],
    [11, 10, 2, 2, '#e0c040'],
  ], // 9 key, a ring with a shaft and one tooth
  bottle, // 10 rum, as the sprite
  [
    [5, 3, 6, 8, '#a0e0c0'],
    [7, 11, 2, 3, '#d8dde3'],
    [5, 13, 6, 1, '#d8dde3'],
  ], // 11 otijom, a glass on a stem
  chair, // 12 chair, as the sprite
]
