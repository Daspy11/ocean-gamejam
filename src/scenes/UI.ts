import Phaser from 'phaser'
import { content, world } from '../store'

export default class UI extends Phaser.Scene {
  private rev = -1
  private hud!: Phaser.GameObjects.Text
  private box!: Phaser.GameObjects.Graphics
  private who!: Phaser.GameObjects.Text
  private body!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    const font = { fontFamily: 'monospace', fontSize: 14, resolution: 1 }
    this.hud = this.add.text(8, 6, '', font)

    // dialogue box spans the bottom third of the 640x360 canvas
    this.box = this.add.graphics()
    this.box.fillStyle(0x101820).fillRect(8, 240, 624, 112)
    this.box.lineStyle(1, 0xffffff, 1).strokeRect(8.5, 240.5, 623, 111)
    this.who = this.add.text(18, 246, '', font)
    this.body = this.add.text(18, 266, '', { ...font, wordWrap: { width: 604 } })

    this.sync()
    this.rev = world.rev
  }

  update() {
    if (world.rev === this.rev) return
    this.rev = world.rev
    this.sync()
  }

  private sync() {
    this.hud.setText(`stone: ${world.inventory.stone ?? 0}`)

    const open = world.dialogue
    const npc = open && world.npcs.find((n) => n.id === open.npc)
    const dialogue = npc && content.dialogues[npc.dialogue]
    const node = open && dialogue && dialogue.nodes[open.node]
    for (const part of [this.box, this.who, this.body]) part.setVisible(!!node)
    if (!open || !dialogue || !node) return

    this.who.setText(dialogue.name)
    const lines = node.choices
      ? node.choices.map((c, i) => `${i === open.choice ? '> ' : '  '}${c.text}`)
      : ['[E] continue']
    this.body.setText([node.text, '', ...lines].join('\n'))
  }
}
