// Regenerates placeholder/. Flat solid fills only: a frame is [x, y, w, h, colour] rects drawn in
// order, or a (x, y) => colour | null pixel test, transparent where nothing is drawn. A sprite is a
// silhouette of two or three flat colours that reads as the thing; tiles are single flat fills.
// No outlines, shading, faces or decoration.
// One entry per sheet below; the terrain and character shapes they draw live in shapes.mjs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { bird, character, crab, dual, shrimp } from './shapes.mjs'

// the coat rack: a post with a crossbar, hung with three hats; it is carried off whole, so one frame
const rack = [
  [7, 8, 2, 24, '#7a5a3a'], // post, crossbar down to the floor
  [2, 8, 12, 2, '#7a5a3a'], // crossbar
  [1, 5, 4, 3, '#c8b088'], // the three hats hung on it
  [6, 5, 4, 3, '#c8b088'],
  [11, 5, 4, 3, '#c8b088'],
]

// the sign's one frame, out here so the sheets list below stays inside the file's line budget
const signpost = [
  [7, 8, 2, 8, '#7a5a3a'], // post
  [2, 2, 12, 7, '#a08050'], // board
]

// The dialogue and inventory frame: a flat panel behind a plain edge, drawn in game as a nine-slice
// cut at 8px, so only the corners survive intact and the middle column and row get stretched.
const boxframe = (x, y) => (x < 2 || y < 2 || x > 21 || y > 21 ? '#e0e0e0' : '#101820')

const sheets = [
  { file: 'tiles/water.png', w: 16, h: 16, cols: 1, frames: [[[0, 0, 16, 16, '#3b6fb6']]] },
  { file: 'tiles/salt.png', w: 16, h: 16, cols: 5, frames: dual('#c4ccd6') },
  { file: 'tiles/sand.png', w: 16, h: 16, cols: 5, frames: dual('#d8c58e') },
  { file: 'tiles/grass.png', w: 16, h: 16, cols: 5, frames: dual('#6da85a') },
  { file: 'tiles/farm.png', w: 16, h: 16, cols: 5, frames: dual('#6b4a2a') },
  { file: 'tiles/rock.png', w: 16, h: 16, cols: 5, frames: dual('#3a3a44') },
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
  { file: 'sprites/walter.png', w: 16, h: 24, cols: 3, frames: crab() },
  {
    file: 'sprites/etarp.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#101010', skin: '#c8c0b8', shirt: '#b03030' }),
  },
  { file: 'sprites/albatross.png', w: 16, h: 24, cols: 3, frames: bird() },
  { file: 'sprites/shrimp.png', w: 16, h: 24, cols: 3, frames: shrimp() },
  {
    file: 'sprites/orb.png',
    w: 16,
    h: 16,
    cols: 1,
    frames: [
      [
        [5, 3, 6, 10, '#e07020'],
        [3, 5, 10, 6, '#e07020'],
      ],
    ],
  },
  {
    file: 'sprites/smoke.png',
    w: 16,
    h: 16,
    cols: 3,
    frames: [
      [
        [5, 9, 6, 4, '#d8dde3'],
        [6, 8, 4, 6, '#d8dde3'],
      ], // 0 a small puff
      [
        [4, 8, 8, 6, '#d8dde3'],
        [5, 7, 6, 8, '#d8dde3'],
      ], // 1 bigger
      [
        [3, 8, 10, 6, '#d8dde3'],
        [4, 7, 8, 8, '#d8dde3'],
      ], // 2 bigger still
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
    file: 'sprites/boat.png',
    w: 32,
    h: 16,
    cols: 2,
    frames: [
      [
        [4, 4, 24, 10, '#7a5a3a'], // hull, wider at the waterline
        [1, 7, 30, 6, '#7a5a3a'],
        [6, 6, 20, 4, '#a08050'], // the inside, open to the sky
      ], // 0 whole
      [
        [10, 4, 18, 10, '#7a5a3a'], // 1 the same hull with the bow, its left end, missing
        [7, 7, 24, 6, '#7a5a3a'],
        [12, 6, 14, 4, '#a08050'],
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
    file: 'sprites/flower.png',
    w: 16,
    h: 16,
    cols: 2,
    frames: [
      [
        [7, 9, 2, 7, '#3f7f3f'], // stem
        [5, 4, 6, 6, '#e06090'], // head, two overlapping rects
        [4, 5, 8, 4, '#e06090'],
      ], // 0 in colour
      [
        [7, 9, 2, 7, '#3f7f3f'],
        [5, 4, 6, 6, '#f4f4f4'],
        [4, 5, 8, 4, '#f4f4f4'],
      ], // 1 gone white
    ],
  },
  { file: 'sprites/sign.png', w: 16, h: 16, cols: 1, frames: [signpost] },
  {
    file: 'sprites/cave.png',
    w: 16,
    h: 32,
    cols: 1,
    frames: [
      [
        [3, 8, 10, 24, '#3a3a44'], // the hump, standing a tile higher than the ground
        [1, 14, 14, 18, '#3a3a44'],
        [5, 20, 6, 12, '#101014'], // the way in, at its foot
        [4, 24, 8, 8, '#101014'],
      ],
    ],
  },
  {
    file: 'sprites/carrot.png',
    w: 16,
    h: 16,
    cols: 1,
    frames: [
      [
        [6, 8, 4, 7, '#e08030'], // the root, tapering into the soil
        [7, 13, 2, 3, '#e08030'],
        [5, 3, 6, 5, '#3f7f3f'], // the leafy top
      ],
    ],
  },
  {
    file: 'sprites/rack.png',
    w: 16,
    h: 32,
    cols: 1,
    frames: [rack],
  },
  {
    file: 'sprites/items.png',
    w: 16,
    h: 16,
    cols: 4,
    frames: [
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
        [7, 6, 2, 8, '#7a5a3a'],
        [3, 6, 10, 2, '#7a5a3a'],
        [2, 3, 4, 3, '#c8b088'],
        [10, 3, 4, 3, '#c8b088'],
      ], // 6 hatrack, a post and crossbar with two hats on it
      [
        [6, 7, 4, 7, '#e08030'],
        [7, 12, 2, 3, '#e08030'],
        [5, 3, 6, 4, '#3f7f3f'],
      ], // 7 carrot, as the sprite
      [
        [2, 3, 12, 10, '#e8e4d8'],
        [9, 9, 4, 4, '#c04040'],
      ], // 8 certificate, a pale sheet with a seal on it
      [[3, 4, 10, 8, '#8a4a5a']], // 9 carpet, a square of rug
    ],
  },
  { file: 'sprites/floor.png', w: 16, h: 16, cols: 1, frames: [[[1, 5, 14, 10, '#8a4a5a']]] },
  { file: 'ui/box.png', w: 24, h: 24, cols: 1, frames: [boxframe] },
]

const mich = {
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

// Walter's line when a block goes down out of reach of the island, and whatever the trees on the
// big island say when they are talked to
const away = {
  name: 'Walter',
  trigger: { event: 'salt:away', when: 'score:on' },
  start: [{ node: '1' }],
  nodes: {
    1: { text: '[PLACEHOLDER Walter: beauty only counts on the main island]', next: null },
  },
}
const bigtree = {
  name: '',
  start: [{ node: '1' }],
  nodes: { 1: { text: '[PLACEHOLDER a tree on the big island]', next: null } },
}

for (const [key, data] of Object.entries({ mich, away, bigtree }))
  write(`dialogue/${key}.json`, `${JSON.stringify(data, null, 2)}\n`)
