import Phaser from 'phaser'
import { JSONS, SHEETS, resolve } from '../assets'
import { MAPS } from '../game/map'
import { createWorld, type Dialogue } from '../game/world'
import { load, setContent } from '../store'

// each font at its native size: advance x line box, and how many of those rows sit above the baseline
const FONTS = {
  basis33: { w: 7, h: 16, base: 11 },
  nihonium: { w: 8, h: 12, base: 10 }, // Nihonium113 Console, the name line's font
}

export default class Boot extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    for (const [key, frame] of Object.entries(SHEETS))
      this.load.spritesheet(key, resolve(`${key}.png`).url, frame)
    for (const key of JSONS) this.load.json(key, resolve(`${key}.json`).url)
    this.load.font('basis33', resolve('fonts/basis33.ttf').url, 'truetype')
    this.load.font('nihonium', resolve('fonts/Nihonium113-Console.ttf').url, 'truetype')
  }

  // Canvas2D never draws a pixel font cleanly: Windows rasterises glyphs through ClearType, so a
  // 1px stem comes out smeared over three pixels even at the exact size on whole pixels. Bake the
  // sheet once instead - draw every character 8x too big, keep the centre sample of each font pixel,
  // and hand Phaser a 1-bit fixed-width bitmap font, which it blits.
  private bakeFont(key: keyof typeof FONTS) {
    const { w: W, h: H, base } = FONTS[key]
    const chars = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') // ' '..'~'
    const S = 8 // one font pixel drawn this many device pixels wide, so a centre sample is never on an edge
    const cols = 16
    const rows = Math.ceil(chars.length / cols)
    const big = document.createElement('canvas')
    big.width = cols * W * S
    big.height = rows * H * S
    const ctx = big.getContext('2d')!
    ctx.font = `${H * S}px ${key}`
    ctx.fillStyle = '#ffffff'
    chars.split('').forEach((ch, i) => {
      ctx.fillText(ch, (i % cols) * W * S, (Math.floor(i / cols) * H + base) * S)
    })

    const from = ctx.getImageData(0, 0, big.width, big.height).data
    const sheet = this.textures.createCanvas(`ui/font/${key}`, cols * W, rows * H)!
    const to = sheet.context.createImageData(sheet.width, sheet.height)
    for (let y = 0; y < sheet.height; y++)
      for (let x = 0; x < sheet.width; x++) {
        const at = ((y * S + S / 2) * big.width + x * S + S / 2) * 4
        to.data.set([255, 255, 255, from[at + 3] > 127 ? 255 : 0], (y * sheet.width + x) * 4)
      }
    sheet.context.putImageData(to, 0, 0)
    sheet.refresh()

    // the cells butt up against each other, so all the spacing a glyph needs is already inside it
    const config = {
      image: `ui/font/${key}`,
      width: W,
      height: H,
      chars,
      charsPerRow: cols,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    }
    this.cache.bitmapFont.add(key, Phaser.GameObjects.RetroFont.Parse(this, config))
  }

  create() {
    for (const key of Object.keys(FONTS) as (keyof typeof FONTS)[]) this.bakeFont(key)
    const dialogues: Record<string, Dialogue> = {}
    // the dialogue id is the basename: 'dialogue/mich' loads as 'mich'
    for (const key of JSONS)
      if (key.startsWith('dialogue/'))
        dialogues[key.slice(key.lastIndexOf('/') + 1)] = this.cache.json.get(key)
    setContent({ dialogues, items: this.cache.json.get('text/items') })

    const files = [
      ...Object.keys(SHEETS).map((key) => `${key}.png`),
      ...JSONS.map((key) => `${key}.json`),
    ]
    const stubs = files.filter((file) => resolve(file).placeholder)
    console.info(`placeholders: ${stubs.join(' ') || 'none, all assets are real'}`)

    const params = new URLSearchParams(location.search)
    const map = params.get('map')
    // ?map=<name> drops straight into gameplay on that map: ?map=gallery is the artist's proof sheet
    if (map && map in MAPS) {
      load(createWorld(map as keyof typeof MAPS))
      this.scene.start('island')
      return
    }
    // ?scene=island skips the cutscene; tests and dev use it
    this.scene.start(params.get('scene') ?? 'intro')
  }
}
