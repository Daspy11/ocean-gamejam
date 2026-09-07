import Phaser from 'phaser'

// assets/text/intro.json: human-written, read verbatim. Nothing here touches `world`: the island
// scene takes the crash over and opens the landing conversation once they are ashore.
type Script = { cast: Record<string, { name: string }>; lines: { who: string; text: string }[] }

const ZOOM = 3 // the cutscene sits a step closer than gameplay: art at 3x, the dialogue box at 1x
const SEAT = 3 // both characters sit this many art pixels above the boat's waterline

export default class Intro extends Phaser.Scene {
  private script!: Script
  private line = 0
  private ending = false
  private water!: Phaser.GameObjects.TileSprite
  private crew!: Phaser.GameObjects.Container
  private actors!: Record<string, Phaser.GameObjects.Image>
  private bob!: Phaser.Tweens.Tween
  private surge!: Phaser.Tweens.Tween
  private box!: Phaser.GameObjects.NineSlice
  private who!: Phaser.GameObjects.BitmapText
  private body!: Phaser.GameObjects.BitmapText
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private seat = 0 // the y the crew rest at, so a hop always returns to it
  private clicked = false // a click advances the line on the next update, exactly like [E]

  constructor() {
    super('intro')
  }

  create() {
    this.line = 0
    this.ending = false
    this.script = this.cache.json.get('text/intro')

    // no camera zoom here: the art carries ZOOM and the box is drawn at 1x on top of it
    this.water = this.add.tileSprite(0, 0, 640, 360, 'tiles/water').setOrigin(0).setTileScale(ZOOM)

    // the boat is 32 art px wide, so this sits it in the middle of the 640 canvas
    const boat = this.add
      .image((640 - 32 * ZOOM) / 2, 208, 'sprites/boat')
      .setOrigin(0, 1)
      .setScale(ZOOM)
    this.seat = boat.y - SEAT * ZOOM
    this.actors = {
      mich: this.add.image(boat.x, this.seat, 'sprites/mich', 7).setOrigin(0, 1).setScale(ZOOM),
      player: this.add
        .image(boat.x + 15 * ZOOM, this.seat, 'sprites/player', 7)
        .setOrigin(0, 1)
        .setScale(ZOOM),
    }
    // the bob and the surge are in screen pixels, so they scale with the art. The boat is added last
    // so it draws on top: its near gunwale cuts across their legs and they read as sat down in it.
    this.crew = this.add.container(-5 * ZOOM, -3 * ZOOM, [
      this.actors.mich,
      this.actors.player,
      boat,
    ])
    this.bob = this.tweens.add({
      targets: this.crew,
      y: 3 * ZOOM,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })
    // rowing is not a steady pace: a quick pull forward, a glide, then a slower drift back. The beat
    // is 1650 ms against the bob's 1800, so the two never settle into one circle.
    this.surge = this.tweens.add({
      targets: this.crew,
      x: 5 * ZOOM,
      duration: 700,
      ease: 'Quad.easeOut',
      hold: 250, // the glide at the end of the stroke
      yoyo: true,
      repeat: -1,
    })

    // same box as UI.ts: the bottom third of the canvas
    this.box = this.add.nineslice(8, 240, 'ui/box', 0, 624, 112, 8, 8, 8, 8).setOrigin(0)
    this.who = this.add.bitmapText(20, 248, 'nihonium', '')
    this.body = this.add.bitmapText(20, 264, 'basis33', '').setMaxWidth(604)

    this.keys = this.input.keyboard!.addKeys('E,SPACE,ENTER,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    this.clicked = false
    this.input.on('pointerdown', () => (this.clicked = true))
    this.show()
  }

  update() {
    this.water.tilePositionX += 0.7 // the sea rushes past: they are rowing hard
    if (this.ending) return
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.land()
      return
    }
    const advance =
      this.clicked ||
      [this.keys.E, this.keys.SPACE, this.keys.ENTER].some((key) =>
        Phaser.Input.Keyboard.JustDown(key),
      )
    this.clicked = false
    if (!advance) return
    this.line++
    if (this.line < this.script.lines.length) this.show()
    else this.crash()
  }

  private show() {
    const line = this.script.lines[this.line]
    this.who.setText(this.script.cast[line.who]?.name ?? '') // cast names, so the lead reads 'You'
    this.body.setText([line.text, '', '[E] continue'].join('\n'))
    const actor = this.actors[line.who]
    if (actor)
      this.tweens.add({
        targets: actor,
        y: { from: this.seat, to: this.seat - 2 * ZOOM }, // a 2px bounce on the line they speak
        duration: 150,
        yoyo: true,
      })
  }

  // "rowing accelerates massively, boat speeds off, crashes into island"
  private crash() {
    this.ending = true
    for (const part of [this.box, this.who, this.body]) part.setVisible(false)
    for (const tween of [this.bob, this.surge]) tween.stop()
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

  // the island scene finishes the crash � the boat coming ashore and the two of them flipping out
  // of it � and opens the landing conversation off the back of it; ?scene=island skips the lot
  private land() {
    this.scene.start('island', { crash: true })
  }
}
