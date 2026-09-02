// Regenerates placeholder/. Flat solid fills only: a frame is [x, y, w, h, colour] rects drawn in
// order, or a (x, y) => colour | null pixel test, transparent where nothing is drawn. A sprite is a
// silhouette of two or three flat colours that reads as the thing; tiles are single flat fills.
// No outlines, shading, faces or decoration.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

// Corner grid of the 4x4 terrain template: cell (row, col) of the sheet covers the 2x2 window at
// (row, col), '1' meaning "this terrain". Must match DUAL_FRAME in src/assets.ts.
const TEMPLATE = ['00110', '00110', '01100', '10011', '11001']

// So a 64x64 terrain sheet fills the quadrants whose corner is '1', and the placeholder file *is*
// the template picture the artist paints over: one continuous blob, every corner case once. The
// quadrant corners at the cell centre are rounded so the autotiling actually reads in game.
const dual = (colour) =>
  Array.from({ length: 16 }, (_, frame) => {
    const row = Math.floor(frame / 4)
    const col = frame % 4
    // quadrant order is top-left, top-right, bottom-left, bottom-right
    const on = [0, 1, 2, 3].map((q) => TEMPLATE[row + (q >> 1)][col + (q % 2)] === '1')
    const corners = on.filter(Boolean).length
    return (x, y) => {
      if (corners === 0) return null
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
const character = ({ hair, skin, shirt }) =>
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

const sheets = [
  { file: 'tiles/water.png', w: 16, h: 16, cols: 1, frames: [[[0, 0, 16, 16, '#3b6fb6']]] },
  { file: 'tiles/salt.png', w: 16, h: 16, cols: 4, frames: dual('#c4ccd6') },
  { file: 'tiles/sand.png', w: 16, h: 16, cols: 4, frames: dual('#d8c58e') },
  { file: 'tiles/grass.png', w: 16, h: 16, cols: 4, frames: dual('#6da85a') },
  {
    file: 'sprites/player.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#303030', skin: '#c8c0b8', shirt: '#e0e0e0' }),
  },
  {
    file: 'sprites/mich.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#c04040', skin: '#c8c0b8', shirt: '#e0e0e0' }),
  },
  {
    file: 'sprites/orb.png',
    w: 16,
    h: 16,
    cols: 2,
    frames: [
      [
        [5, 3, 6, 10, '#e07020'],
        [3, 5, 10, 6, '#e07020'],
      ], // 0 bare
      [
        [5, 3, 6, 10, '#e07020'],
        [3, 5, 10, 6, '#e07020'],
        [2, 9, 12, 2, '#c4ccd6'],
        [0, 11, 16, 3, '#c4ccd6'],
      ], // 1 with a salt crust grown around it
    ],
  },
  {
    file: 'sprites/tree.png',
    w: 16,
    h: 32,
    cols: 1,
    frames: [
      [
        [6, 22, 4, 10, '#7a5a3a'], // trunk
        [4, 0, 8, 4, '#3f7f3f'], // canopy, widest in the middle
        [2, 4, 12, 8, '#3f7f3f'],
        [0, 12, 16, 6, '#3f7f3f'],
        [2, 18, 12, 4, '#3f7f3f'],
      ],
    ],
  },
  {
    file: 'sprites/hut.png',
    w: 32,
    h: 40,
    cols: 1,
    frames: [
      [
        [2, 22, 28, 18, '#8a6a4a'], // walls
        [0, 16, 32, 6, '#6a4a3a'], // roof, stepped to a point
        [4, 10, 24, 6, '#6a4a3a'],
        [8, 4, 16, 6, '#6a4a3a'],
        [12, 0, 8, 4, '#6a4a3a'],
        [13, 30, 6, 10, '#4a3a2a'], // door
      ],
    ],
  },
  {
    file: 'sprites/boat.png',
    w: 32,
    h: 16,
    cols: 1,
    frames: [
      [
        [4, 4, 24, 10, '#7a5a3a'], // hull, wider at the waterline
        [1, 7, 30, 6, '#7a5a3a'],
        [6, 6, 20, 4, '#a08050'], // the inside, open to the sky
      ],
    ],
  },
  {
    file: 'sprites/crate.png',
    w: 16,
    h: 16,
    cols: 2,
    frames: [
      [
        [2, 4, 12, 10, '#a08050'],
        [2, 4, 12, 2, '#705030'], // lid
      ], // 0 closed
      [
        [2, 5, 12, 9, '#a08050'],
        [2, 0, 12, 3, '#705030'], // lid lifted clear of the box
      ], // 1 open
    ],
  },
  {
    file: 'sprites/items.png',
    w: 16,
    h: 16,
    cols: 2,
    frames: [
      [
        [3, 9, 10, 4, '#c4ccd6'],
        [5, 6, 6, 3, '#c4ccd6'],
      ], // 0 salt, a pile
      [
        [5, 3, 6, 10, '#e07020'],
        [3, 5, 10, 6, '#e07020'],
      ], // 1 orb, as frame 0 of orb.png
    ],
  },
]

const dialogue = {
  name: 'Mich',
  start: [{ when: 'mich_met', node: 'again' }, { node: 'greet' }],
  nodes: {
    greet: {
      text: '[PLACEHOLDER greeting]',
      choices: [
        { text: '[PLACEHOLDER choice A]', next: 'a', set: { mich_met: true, mich_choice: 1 } },
        { text: '[PLACEHOLDER choice B]', next: 'b', set: { mich_met: true, mich_choice: 2 } },
      ],
    },
    a: { text: '[PLACEHOLDER reply A]', next: null },
    b: { text: '[PLACEHOLDER reply B]', next: null },
    again: { text: '[PLACEHOLDER repeat greeting]', next: null },
  },
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'placeholder')

function write(file, data) {
  const out = join(root, file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, data)
  console.log('wrote placeholder/' + file)
}

for (const sheet of sheets) {
  const png = new PNG({
    width: sheet.cols * sheet.w,
    height: Math.ceil(sheet.frames.length / sheet.cols) * sheet.h,
  })
  png.data.fill(0)
  sheet.frames.forEach((frame, i) => {
    const ox = (i % sheet.cols) * sheet.w
    const oy = Math.floor(i / sheet.cols) * sheet.h
    for (let y = 0; y < sheet.h; y++)
      for (let x = 0; x < sheet.w; x++) {
        // a rect frame is drawn in order, so the last rect covering the pixel is the one on top
        const colour =
          typeof frame === 'function'
            ? frame(x, y)
            : frame.reduce(
                (c, [rx, ry, rw, rh, rc]) =>
                  x >= rx && x < rx + rw && y >= ry && y < ry + rh ? rc : c,
                null,
              )
        if (!colour) continue
        const rgb = [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16))
        png.data.set([...rgb, 255], ((oy + y) * png.width + ox + x) * 4)
      }
  })
  write(sheet.file, PNG.sync.write(png))
}

write('dialogue/mich.json', `${JSON.stringify(dialogue, null, 2)}\n`)
