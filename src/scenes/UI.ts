import Phaser from 'phaser'
import { ITEMS, type Item } from '../game/world'
import { content, world } from '../store'

const SLOT = 32 // inventory slot size; the 5x3 grid starts at 240,120 so the panel is centred on 640x360

export default class UI extends Phaser.Scene {
  private rev = -1
  private font = { fontFamily: 'monospace', fontSize: 14, resolution: 1 }
  private hud!: Phaser.GameObjects.Text
  private box!: Phaser.GameObjects.Graphics
  private who!: Phaser.GameObjects.Text
  private body!: Phaser.GameObjects.Text
  private panel!: Phaser.GameObjects.Graphics
  private label!: Phaser.GameObjects.Text
  private slots: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('ui')
  }

  create() {
    this.hud = this.add.text(8, 6, '', this.font)

    // dialogue box spans the bottom third of the 640x360 canvas
    this.box = this.add.graphics()
    this.box.fillStyle(0x101820).fillRect(8, 240, 624, 112)
    this.box.lineStyle(1, 0xffffff, 1).strokeRect(8.5, 240.5, 623, 111)
    this.who = this.add.text(18, 246, '', this.font)
    this.body = this.add.text(18, 266, '', { ...this.font, wordWrap: { width: 604 } })

    this.panel = this.add.graphics()
    this.panel.fillStyle(0x101820).fillRect(228, 108, 184, 144)
    this.panel.lineStyle(1, 0xffffff, 1).strokeRect(228.5, 108.5, 183, 143)
    this.label = this.add.text(240, 222, '', this.font)

    this.sync()
    this.rev = world.rev
  }

  update() {
    if (world.rev === this.rev) return
    this.rev = world.rev
    this.sync()
  }

  private sync() {
    this.hud.setText(`salt: ${world.inventory.salt ?? 0}`)
    // dialogue may have renamed an item, so the flag wins over the content file
    const name = (id: Item) => `${world.flags[`name:${id}`] ?? content.items[id]?.name ?? id}`

    const open = world.dialogue
    const dialogue = open ? content.dialogues[open.key] : undefined
    const node = open && dialogue ? dialogue.nodes[open.node] : undefined
    for (const part of [this.box, this.who, this.body]) part.setVisible(!!node)
    if (open && dialogue && node) {
      const who = node.who ?? dialogue.name
      this.who.setText(who).setVisible(!!who) // '' is the unnamed lead: no name line, body stays put
      const lines = node.choices
        ? node.choices.map((c, i) => `${i === open.choice ? '> ' : '  '}${c.text}`)
        : ['[E] continue']
      const text = open.item ? node.text.replaceAll('{item}', name(open.item)) : node.text
      this.body.setText([text, '', ...lines].join('\n'))
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
        this.add.text(x + SLOT - 1, y + SLOT - 1, `${n}`, this.font).setOrigin(1),
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
