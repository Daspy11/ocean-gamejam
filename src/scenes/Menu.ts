import Phaser from 'phaser'

export default class Menu extends Phaser.Scene {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('menu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000')
    this.add
      .text(320, 120, 'Project Island', { fontFamily: 'monospace', fontSize: 24, resolution: 1 })
      .setOrigin(0.5)
    this.add
      .text(320, 200, '> start', { fontFamily: 'monospace', fontSize: 14, resolution: 1 })
      .setOrigin(0.5)

    this.keys = this.input.keyboard!.addKeys('E,SPACE,ENTER') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    this.input.once('pointerdown', () => this.scene.start('intro'))
  }

  update() {
    if (Object.values(this.keys).some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.scene.start('intro')
  }
}
