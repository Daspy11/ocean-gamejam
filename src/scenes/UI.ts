import Phaser from 'phaser'
import { ITEMS, type Item } from '../game/world'
import { content, world } from '../store'

const SLOT = 32 // inventory slot size; the 5x3 grid starts at 240,120 so the panel is centred on 640x360

export default class UI extends Phaser.Scene {
  private rev = -1
  private hud!: Phaser.GameObjects.BitmapText
  private box!: Phaser.GameObjects.NineSlice
  private who!: Phaser.GameObjects.BitmapText
  private body!: Phaser.GameObjects.BitmapText
  private panel!: Phaser.GameObjects.NineSlice
  private label!: Phaser.GameObjects.BitmapText
  private slots: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('ui')
  }

  create() {
    this.hud = this.add.bitmapText(8, 6, 'nihonium', '')

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
    if (world.rev === this.rev) return
    this.rev = world.rev
    this.sync()
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
      const who = node.who === '' ? 'You' : (node.who ?? dialogue.name)
      this.who.setText(who).setVisible(!!who)
      const lines = node.choices
        ? node.choices.map((c, i) => `${i === open.choice ? '> ' : '  '}${c.text}`)
        : ['[E] continue']
      const filled = (open.item ? text.replaceAll('{item}', name(open.item)) : text).replaceAll(
        '{score}',
        `${world.score}`,
      )
      this.body.setText([filled, '', ...lines].join('\n'))
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
