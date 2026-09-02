import Phaser from 'phaser'
import { DUAL_FRAME } from '../assets'
import { dispatch } from '../store'

// assets/text/intro.json: human-written, read verbatim. The only thing here that touches `world`
// is the landing conversation the cutscene hands over to.
type Script = { cast: Record<string, { name: string }>; lines: { who: string; text: string }[] }

const FONT = { fontFamily: 'monospace', fontSize: 14, resolution: 1 }
const SEAT = 204 // both characters sit 6 px above the boat's waterline at y 210

export default class Intro extends Phaser.Scene {
  private script!: Script
  private line = 0
  private ending = false
  private water!: Phaser.GameObjects.TileSprite
  private crew!: Phaser.GameObjects.Container
  private actors!: Record<string, Phaser.GameObjects.Image>
  private bob!: Phaser.Tweens.Tween
  private box!: Phaser.GameObjects.Graphics
  private who!: Phaser.GameObjects.Text
  private body!: Phaser.GameObjects.Text
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('intro')
  }

  create() {
    this.line = 0
    this.ending = false
    this.script = this.cache.json.get('text/intro')

    // no camera zoom here, so everything is drawn at 640x360 and the sprites carry the 2x scale
    this.water = this.add.tileSprite(0, 0, 640, 360, 'tiles/water').setOrigin(0).setTileScale(2)
    this.add
      .tileSprite(540, 60, 200, 240, 'tiles/sand', DUAL_FRAME[15])
      .setOrigin(0)
      .setTileScale(2)

    const boat = this.add.image(200, 210, 'sprites/boat').setOrigin(0, 1).setScale(2)
    this.actors = {
      mich: this.add
        .image(boat.x + 8, SEAT, 'sprites/mich', 7)
        .setOrigin(0, 1)
        .setScale(2),
      player: this.add
        .image(boat.x + 40, SEAT, 'sprites/player', 7)
        .setOrigin(0, 1)
        .setScale(2),
    }
    this.crew = this.add.container(0, -3, [boat, this.actors.mich, this.actors.player])
    this.bob = this.tweens.add({
      targets: this.crew,
      y: 3,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // same box as UI.ts: the bottom third of the canvas
    this.box = this.add.graphics()
    this.box.fillStyle(0x101820).fillRect(8, 240, 624, 112)
    this.box.lineStyle(1, 0xffffff, 1).strokeRect(8.5, 240.5, 623, 111)
    this.who = this.add.text(18, 246, '', FONT)
    this.body = this.add.text(18, 266, '', { ...FONT, wordWrap: { width: 604 } })

    this.keys = this.input.keyboard!.addKeys('E,SPACE,ENTER,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    this.show()
  }

  update() {
    this.water.tilePositionX += 0.3 // the sea slides past the boat
    if (this.ending) return
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.land()
      return
    }
    const advance = [this.keys.E, this.keys.SPACE, this.keys.ENTER].some((key) =>
      Phaser.Input.Keyboard.JustDown(key),
    )
    if (!advance) return
    this.line++
    if (this.line < this.script.lines.length) this.show()
    else this.crash()
  }

  private show() {
    const line = this.script.lines[this.line]
    this.who.setText(this.script.cast[line.who]?.name ?? '') // the player has no name, so no name line
    this.body.setText([line.text, '', '[E] continue'].join('\n'))
    const actor = this.actors[line.who]
    if (actor)
      this.tweens.add({
        targets: actor,
        y: { from: SEAT, to: SEAT - 6 },
        duration: 150,
        yoyo: true,
      })
  }

  // "rowing accelerates massively, boat speeds off, crashes into island"
  private crash() {
    this.ending = true
    for (const part of [this.box, this.who, this.body]) part.setVisible(false)
    this.bob.stop()
    this.tweens.add({
      targets: this.crew,
      x: 720,
      duration: 1200,
      ease: 'Expo.easeIn',
      onComplete: () => {
        this.cameras.main.shake(300, 0.02)
        this.cameras.main.fadeOut(400)
      },
    })
    this.cameras.main.once('camerafadeoutcomplete', () => this.land())
  }

  // gameplay opens on the two of them arguing about the wreck; ?scene=island skips this with the rest
  private land() {
    dispatch({ type: 'talk', key: 'landing' })
    this.scene.start('island')
  }
}
