// Regenerates placeholder/. Flat solid fills only: a frame is [x, y, w, h, colour] rects drawn in
// order, or a (x, y) => colour | null pixel test, transparent where nothing is drawn. A sprite is a
// silhouette of two or three flat colours that reads as the thing; tiles are single flat fills.
// No outlines, shading, faces or decoration.
// One entry per sheet below; the terrain and character shapes they draw live in shapes.mjs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  bar,
  bird,
  bottle,
  cannon,
  certificate,
  chair,
  character,
  cinder,
  crab,
  dual,
  egg,
  flyingcarpet,
  gate,
  heart,
  items,
  serious,
  shadow,
  shrimp,
  signpost,
} from './shapes.mjs'

// the sea horse, and the desalinator he is so proud of: a boiler with a chimney on top
const seahorse = character({ hair: '#2a6f6f', skin: '#7fd0c8', shirt: '#2a6f6f' })
const machine = (x, y) => ((y > 8 ? x > 1 && x < 14 : x > 9 && x < 12 && y > 2) ? '#5a5a66' : null)

// a fence post: one rail the full width of the tile, so a run of them joins up
const fence = (x, y) => ((y > 5 && y < 8) || (x > 5 && x < 10 && y > 3) ? '#7a5a3a' : null)
// the same post and rail, turned 90 degrees for a run climbing north-south instead of east-west
const fencev = (x, y) => fence(y, x)

// The dialogue and inventory frame: a flat panel behind a plain edge, drawn in game as a nine-slice
// cut at 8px, so only the corners survive intact and the middle column and row get stretched.
const boxframe = (x, y) => (x < 2 || y < 2 || x > 21 || y > 21 ? '#e0e0e0' : '#101820')

const sheets = [
  { file: 'tiles/water.png', w: 16, h: 16, cols: 1, frames: [[[0, 0, 16, 16, '#3b6fb6']]] },
  { file: 'tiles/salt.png', w: 16, h: 16, cols: 5, frames: dual('#c4ccd6') },
  { file: 'tiles/sand.png', w: 16, h: 16, cols: 5, frames: dual('#d8c58e') },
  { file: 'tiles/grass.png', w: 16, h: 16, cols: 5, frames: dual('#6da85a') },
  { file: 'tiles/charred.png', w: 16, h: 16, cols: 5, frames: dual('#3a3028') },
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
  { file: 'sprites/seahorse.png', w: 16, h: 24, cols: 3, frames: seahorse },
  {
    file: 'sprites/etarp.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#101010', skin: '#c8c0b8', shirt: '#b03030' }),
  },
  { file: 'sprites/albatross.png', w: 16, h: 24, cols: 3, frames: bird() },
  {
    file: 'sprites/harry.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#806040', skin: '#c8c0b8', shirt: '#404860' }),
  },
  { file: 'sprites/shrimp.png', w: 16, h: 24, cols: 3, frames: shrimp() },
  {
    file: 'sprites/tarq.png',
    w: 16,
    h: 24,
    cols: 3,
    frames: character({ hair: '#e8d8a0', skin: '#c8c0b8', shirt: '#6a3a9a' }),
  },
  { file: 'sprites/serious.png', w: 16, h: 24, cols: 4, frames: serious() },
  { file: 'sprites/shrimpchair.png', w: 16, h: 24, cols: 3, frames: shrimp(true) },
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
    cols: 2,
    frames: [
      [
        [3, 8, 10, 24, '#3a3a44'], // the hump, standing a tile higher than the ground
        [1, 14, 14, 18, '#3a3a44'],
        [5, 20, 6, 12, '#101014'], // the way in, at its foot
        [4, 24, 8, 8, '#101014'],
      ], // 0 the mouth out on the grass
      [
        [2, 8, 12, 24, '#101014'], // 1 the same hole, seen from inside the rock room: just the dark opening
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
  { file: 'sprites/rum.png', w: 16, h: 16, cols: 1, frames: [bottle] },
  { file: 'sprites/bar.png', w: 16, h: 16, cols: 2, frames: bar },
  { file: 'sprites/gate.png', w: 16, h: 16, cols: 1, frames: [gate] },
  { file: 'sprites/chair.png', w: 16, h: 16, cols: 1, frames: [chair] },
  { file: 'sprites/cannon.png', w: 16, h: 16, cols: 1, frames: [cannon] },
  { file: 'sprites/ball.png', w: 16, h: 16, cols: 1, frames: [[[5, 5, 6, 6, '#ffffff']]] },
  { file: 'sprites/embedded.png', w: 16, h: 16, cols: 1, frames: [[[5, 6, 6, 5, '#3a3a44']]] },
  { file: 'sprites/cinder.png', w: 16, h: 16, cols: 1, frames: [cinder] },
  { file: 'sprites/flyingcarpet.png', w: 32, h: 32, cols: 1, frames: [flyingcarpet] },
  { file: 'sprites/shadow.png', w: 32, h: 32, cols: 1, frames: [shadow] },
  { file: 'sprites/heart.png', w: 16, h: 16, cols: 1, frames: [heart] },
  { file: 'sprites/items.png', w: 16, h: 16, cols: 4, frames: items },
  { file: 'sprites/machine.png', w: 16, h: 16, cols: 1, frames: [machine] },
  { file: 'sprites/fence.png', w: 16, h: 16, cols: 1, frames: [fence] },
  { file: 'sprites/fencev.png', w: 16, h: 16, cols: 1, frames: [fencev] },
  { file: 'sprites/floor.png', w: 16, h: 16, cols: 1, frames: [[[1, 5, 14, 10, '#8a4a5a']]] },
  { file: 'sprites/egg.png', w: 16, h: 16, cols: 1, frames: [egg] },
  { file: 'sprites/certificate.png', w: 16, h: 16, cols: 1, frames: [certificate] },
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

// `npm run placeholders -- sprites/egg.png` writes only the sheets named and leaves the rest alone,
// since hand-drawn art has been dropped in here beside the generated stand-ins
const only = process.argv.slice(2)
for (const sheet of sheets) {
  if (only.length && !only.includes(sheet.file)) continue
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

if (!only.length)
  for (const [key, data] of Object.entries({ mich, away, bigtree }))
    write(`dialogue/${key}.json`, `${JSON.stringify(data, null, 2)}\n`)
