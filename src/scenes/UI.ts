import Phaser from 'phaser'
import { ITEMS, type Item, type World } from '../game/world'
import { choices } from '../game/throw'
import { content, world } from '../store'

const SLOT = 32 // inventory slot size; the 5x3 grid starts at 240,120 so the panel is centred on 640x360

export default class UI extends Phaser.Scene {
  private rev = -1
  private leavingAt: number | null = null
  private hud!: Phaser.GameObjects.BitmapText
  private box!: Phaser.GameObjects.NineSlice
  private who!: Phaser.GameObjects.BitmapText
  private body!: Phaser.GameObjects.BitmapText
  private panel!: Phaser.GameObjects.NineSlice
  private label!: Phaser.GameObjects.BitmapText
  private slots: Phaser.GameObjects.GameObject[] = []
  private black!: Phaser.GameObjects.Rectangle
  private big!: Phaser.GameObjects.Image
  private white!: Phaser.GameObjects.Image // the same sheet filled white, faded in over a burst
  private sky!: Phaser.GameObjects.Graphics // the shooting stars of a burst close-up

  constructor() {
    super('ui')
  }

  create() {
    this.leavingAt = null
    // a close-up: the world goes black under a sheet drawn 7.5x, half the screen tall, over the box
    this.black = this.add.rectangle(0, 0, 640, 360, 0x000000).setOrigin(0).setVisible(false)
    this.sky = this.add.graphics()
    this.big = this.add.image(320, 130, 'sprites/walter', 1).setScale(7.5).setVisible(false)
    this.white = this.add.image(320, 130, 'sprites/walter', 1).setScale(7.5).setVisible(false)
    this.white.setTintFill(0xffffff)
    // white, with the score pops' shadow under it so it reads over the sea and the crust alike
    this.hud = this.add.bitmapText(8, 6, 'nihonium', '').setDropShadow(1, 1, 0x1a1c2c, 1)

    // dialogue box spans the bottom third of the 640x360 canvas; the 8px frame leaves 248..344
    // inside it, which is exactly the 16px name line plus five 16px body lines
    this.box = this.add.nineslice(8, 240, 'ui/box', 0, 624, 112, 8, 8, 8, 8).setOrigin(0)
    this.who = this.add.bitmapText(20, 248, 'nihonium', '')
    this.body = this.add.bitmapText(20, 264, 'basis33', '').setMaxWidth(604)

    this.panel = this.add.nineslice(228, 108, 'ui/box', 0, 184, 144, 8, 8, 8, 8).setOrigin(0)
    this.label = this.add.bitmapText(240, 224, 'basis33', '')

    this.sync()
    this.rev = world.rev
  }

  update() {
    if (!world.flags.outro) this.leavingAt = null
    else this.leavingAt ??= world.time
    this.hud.setAlpha(
      this.leavingAt === null ? 1 : Math.max(0, 1 - (world.time - this.leavingAt) / 4000),
    )
    // the black fades up over 500 ms off sim time, and the sheet shows once it is all black; a
    // burst close-up has the Island scene zoom in on him for 1 s instead of the black, and the
    // sheet then sits over his own sprite: the camera centres his tile, and his feet are 4 px down
    const c = world.closeup
    const burst = !!c && c.burst !== undefined
    const up = !!c && c.down === undefined && world.time - c.since >= (burst ? 1000 : 500)
    this.black.setVisible(!!c && !burst).setAlpha(c ? Math.min(1, (world.time - c.since) / 500) : 0)
    this.big
      .setVisible(up)
      .setAlpha(1)
      .setPosition(320, burst ? 150 : 130)
    this.white.setVisible(false)
    if (c) {
      const frame = Math.min(c.frames - 1, Math.floor(Math.max(0, world.time - c.at) / 400))
      this.big.setTexture(`sprites/${c.sheet}`, c.frame + frame)
      this.white.setTexture(`sprites/${c.sheet}`, c.frame + frame)
    }
    this.sky.clear()
    if (c && burst) this.drawBurst(c, up)
    if (world.rev === this.rev) return
    this.rev = world.rev
    this.sync()
  }

  // the dramatic entry: pixels streak left to right, coming in with the zoom; from `burst` he
  // shakes harder and harder and goes white, and 1200 ms on flies apart into little stars that
  // fade as he comes back through them
  private drawBurst(c: NonNullable<World['closeup']>, up: boolean) {
    const g = this.sky
    const t = world.time
    // the stars come in with the zoom and go out with it
    const fade =
      c.down === undefined
        ? Math.min(1, (t - c.since) / 1000)
        : Math.max(0, 1 - (t - c.down) / 1000)
    for (let i = 0; i < 96; i++) {
      // each star has its own row, speed and length off its index, so the sky is the same every run
      const len = 16 + ((i * 7) % 28)
      const speed = 700 + ((i * 131) % 900) // px per second
      const x = ((t * speed) / 1000 + i * 173) % (640 + len)
      const y = (i * 97 + 13) % 360
      const a = fade * (0.7 + ((i * 3) % 4) / 10)
      g.fillStyle(0xffffff, a * 0.5).fillRect(x - len, y, len, 2) // the tail
      g.fillStyle(0xffffff, a).fillRect(x - 6, y, 6, 2) // and its bright head
    }
    if (!up) return
    const shaking = typeof c.burst === 'number' ? t - c.burst : 0
    if (shaking < 1200) {
      const amp = 12 * (shaking / 1200) ** 2 // still at first, and out to 12 px by the end
      const dx = amp * Math.sin(t / 9) // sim time drives the jitter, so nothing to seed
      const dy = amp * Math.sin(t / 7 + 2)
      this.big.setPosition(320 + dx, 150 + dy)
      this.white
        .setPosition(320 + dx, 150 + dy)
        .setVisible(shaking > 0)
        .setAlpha(shaking / 1200)
      return
    }
    const out = (shaking - 1200) / 800 // 0..1 as the stars fly out and fade, and he comes back
    this.big.setAlpha(Math.min(1, out))
    if (out >= 1) return
    g.fillStyle(0xffffff, 1 - out)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.1
      const r = 30 + out * (90 + ((i * 37) % 60))
      const x = Math.round(320 + Math.cos(a) * r)
      const y = Math.round(150 + Math.sin(a) * r)
      g.fillRect(x - 2, y, 5, 1).fillRect(x, y - 2, 1, 5) // a little four-point star
    }
  }

  private sync() {
    this.hud.setText(world.flags['score:on'] ? `beauty: ${world.score}` : '')
    // dialogue may have renamed an item, so the flag wins over the content file
    const name = (id: Item) =>
      `${world.flags[`name:${id}`] ?? content.items[id]?.name ?? `[PLACEHOLDER ${id}]`}`

    const open = world.dialogue
    const dialogue = open ? content.dialogues[open.key] : undefined
    const node = open && dialogue ? dialogue.nodes[open.node] : undefined
    const text = node?.text // a node with no text is an act: no box, the sim runs it and moves on
    for (const part of [this.box, this.who, this.body]) part.setVisible(text !== undefined)
    if (open && dialogue && node && text !== undefined) {
      // a node's own who of '' is the lead speaking, and he goes by 'You'; a dialogue with no name
      // at all is narration ('you got {item}'), which gets no name line and the body stays put
      const who = node.who === '' ? 'You' : node.who === null ? '' : (node.who ?? dialogue.name)
      this.who.setText(who).setVisible(!!who)
      const lines = node.choices
        ? choices(world, node, dialogue).map(
            (c, i) => `${i === open.choice ? '> ' : '  '}${c.text}`,
          )
        : ['[E] continue']
      const filled = (open.item ? text.replaceAll('{item}', name(open.item)) : text).replaceAll(
        '{score}',
        `${world.score}`,
      )
      this.body.setText([filled, '', ...lines].join('\n'))
      const height = Math.max(112, this.body.height + 40)
      this.box.setSize(624, height).setY(352 - height)
      this.who.setY(360 - height)
      this.body.setY(376 - height)
    }

    const menu = world.menu
    for (const part of [this.panel, this.label]) part.setVisible(!!menu)
    for (const slot of this.slots) slot.destroy()
    this.slots = []
    if (!menu) return

    // same order the sim walks for the cursor: inventory ids with a count, insertion order
    const entries = Object.entries(world.inventory).filter(([, n]) => (n ?? 0) > 0) as [
      Item,
      number,
    ][]
    entries.forEach(([id, n], i) => {
      const x = 240 + (i % 5) * SLOT
      const y = 120 + Math.floor(i / 5) * SLOT
      this.slots.push(
        this.add.image(x, y, 'sprites/items', ITEMS.indexOf(id)).setOrigin(0).setScale(2),
        this.add.bitmapText(x + SLOT - 1, y + SLOT - 1, 'basis33', `${n}`).setOrigin(1),
      )
    })

    const cursor = this.add.graphics().lineStyle(1, 0xffffff, 1)
    cursor.strokeRect(
      240.5 + (menu.cursor % 5) * SLOT,
      120.5 + Math.floor(menu.cursor / 5) * SLOT,
      SLOT - 1,
      SLOT - 1,
    )
    this.slots.push(cursor)

    const id = entries[menu.cursor]?.[0]
    this.label.setText(id ? name(id) : '[PLACEHOLDER empty]') // long names spill out of the panel
  }
}
