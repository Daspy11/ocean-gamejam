import Phaser from 'phaser'

export default class Menu extends Phaser.Scene {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('menu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000')
    // the title is the only text in the game drawn at two font pixels to the canvas pixel
    this.add.bitmapText(320, 120, 'basis33', 'Project Island').setOrigin(0.5).setScale(2)
    this.add.bitmapText(320, 200, 'basis33', '> start').setOrigin(0.5)

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
