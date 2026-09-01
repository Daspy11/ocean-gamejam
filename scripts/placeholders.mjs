// Regenerates placeholder/. Flat solid fills only: [x, y, w, h, colour] rects inside a 16x16 frame,
// transparent where nothing is drawn. The player's edge bar is functional (it shows facing), not decoration.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const sheets = [
  {
    file: 'tiles/terrain.png',
    frames: [
      [[0, 0, 16, 16, '#3b6fb6']], // 0 water
      [[0, 0, 16, 16, '#d8c58e']], // 1 sand
      [[0, 0, 16, 16, '#6da85a']], // 2 grass
    ],
  },
  {
    file: 'sprites/player.png',
    frames: [
      [
        [0, 0, 16, 16, '#e0e0e0'],
        [0, 14, 16, 2, '#303030'],
      ], // 0 down
      [
        [0, 0, 16, 16, '#e0e0e0'],
        [0, 0, 16, 2, '#303030'],
      ], // 1 up
      [
        [0, 0, 16, 16, '#e0e0e0'],
        [0, 0, 2, 16, '#303030'],
      ], // 2 left
      [
        [0, 0, 16, 16, '#e0e0e0'],
        [14, 0, 2, 16, '#303030'],
      ], // 3 right
    ],
  },
  {
    file: 'sprites/objects.png',
    frames: [
      [[0, 0, 16, 16, '#1f3f7a']], // 0 tidepool
      [[4, 4, 8, 8, '#8a8a8a']], // 1 stone, centred on a transparent frame
      [[0, 0, 16, 16, '#c060c0']], // 2 npc
    ],
  },
]

const dialogue = {
  name: '[PLACEHOLDER NPC NAME]',
  start: [{ when: 'npc1_met', node: 'again' }, { node: 'greet' }],
  nodes: {
    greet: {
      text: '[PLACEHOLDER greeting]',
      choices: [
        { text: '[PLACEHOLDER choice A]', next: 'a', set: { npc1_met: true, npc1_choice: 1 } },
        { text: '[PLACEHOLDER choice B]', next: 'b', set: { npc1_met: true, npc1_choice: 2 } },
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
  const png = new PNG({ width: sheet.frames.length * 16, height: 16 })
  png.data.fill(0)
  sheet.frames.forEach((frame, i) => {
    for (const [x, y, w, h, colour] of frame) {
      const rgb = [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16))
      for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++) {
          const o = (py * png.width + i * 16 + px) * 4
          png.data.set([...rgb, 255], o)
        }
    }
  })
  write(sheet.file, PNG.sync.write(png))
}

write('dialogue/npc1.json', `${JSON.stringify(dialogue, null, 2)}\n`)
