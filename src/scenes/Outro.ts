import Phaser from 'phaser'
import { createWorld } from '../game/world'
import { load, world } from '../store'

// The flight out, played once the carpet has left the island: the two of them (and Walter, if he
// asked nicely) over open water, one heart between them, and then a spotlight closing on the party
// into the credits. Nothing here touches `world`; it only reads whether Walter came along.

const ZOOM = 3 // the shot settles here: art at 3x on the 640x360 canvas, a step in from the island
const OPEN = 2 // and it opens at the island scene's own zoom, so the flight out never cuts
const IN = 1800 // ms the shot takes to ease from the one to the other
const MID = 320 // the middle of the canvas, which is where the carpet flies
const DECK = 200 // the y their feet stand at, the middle of the carpet's weave
// how fast the sea runs by in screen px/s: the speed the carpet leaves the island at, easing back
// to a cruise once the shot has settled, so the two scenes join at the same pace
const RUSH = 540
const CRUISE = 240

// who is named for what, in the order the credits play
const CREDITS = [
  ['programming', 'Stuart Johnson'],
  ['writing', 'Stuart Johnson'],
  ['art', 'Michelle Vizina'],
  ['music', 'Michelle Vizina'],
]

// the send-off after the names, a card at a time. Written by the author; do not reword.
const CARDS = ['thanks for playing :)', 'this was our first game, and we hope you enjoyed it']

export default class Outro extends Phaser.Scene {
  private water!: Phaser.GameObjects.TileSprite
  private crew!: Phaser.GameObjects.Container
  private player!: Phaser.GameObjects.Image
  private hole!: Phaser.GameObjects.Graphics
  private opened = 0 // when the shot started easing in, which is what the sea's pace follows
  private iris = -1 // the sim time the spotlight started closing, -1 until it does
  private enter!: Phaser.Input.Keyboard.Key
  private card = -1 // which of CARDS is up; -1 while the names are still the whole screen
  private text: Phaser.GameObjects.GameObject[] = [] // whatever is on the black right now
  private ready = -1 // when what is up finished fading in, so it can move on 4 s later; -1 waiting
  private again = false // the last card is up and Enter starts the game over

  constructor() {
    super('outro')
  }

  create() {
    this.iris = -1
    this.card = -1
    this.text = []
    this.ready = -1
    this.again = false
    this.opened = 0
    this.enter = this.input.keyboard!.addKey('ENTER')
    this.water = this.add.tileSprite(0, 0, 640, 360, 'tiles/water').setOrigin(0).setTileScale(OPEN)

    // the crew are laid out in art pixels and the container carries the zoom, so the whole shot
    // eases in as one thing. 16x24 characters, feet on the weave: she rides on the near side.
    const carpet = this.add.image(0, 0, 'sprites/flyingcarpet')
    const mich = this.add.image(-9, 0, 'sprites/mich', 7).setOrigin(0.5, 1)
    this.player = this.add.image(9, 0, 'sprites/player', 7).setOrigin(0.5, 1)
    const aboard = world.flags['walter:aboard'] // he asked, and he is riding on her head
    const walter = this.add
      .image(mich.x, -24, 'sprites/walter', 1)
      .setOrigin(0.5, 1)
      .setVisible(!!aboard)
    this.crew = this.add.container(MID, DECK, [carpet, mich, this.player, walter]).setScale(OPEN)

    // the flight: the sea runs past under them, and the carpet rides a long, easy swell
    this.tweens.add({
      targets: this.crew,
      y: DECK - 10,
      duration: 2200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // he takes his time about it: once the shot has settled he looks over at her, leans in, and one
    // heart goes up between them before he faces the way they are going again
    this.time.delayedCall(2600, () => {
      this.player.setFrame(4) // the standing frame, facing her
      this.tweens.add({ targets: this.player, x: 5, duration: 700, ease: 'Sine.easeInOut' })
    })
    this.time.delayedCall(3300, () => this.heart())
    this.time.delayedCall(6200, () => {
      this.player.setFrame(7)
      this.tweens.add({ targets: this.player, x: 9, duration: 800, ease: 'Sine.easeInOut' })
    })

    // then the spotlight closes on the three of them and the names come up on the black
    this.hole = this.make.graphics({ x: 0, y: 0 })
    const black = this.add.rectangle(0, 0, 640, 360, 0x000000).setOrigin(0).setDepth(100)
    const mask = this.hole.createGeometryMask()
    mask.setInvertAlpha(true) // black everywhere the circle is not
    black.setMask(mask)
    // the spotlight shuts slowly, and the black holds a beat on its own before the first name
    this.time.delayedCall(7600, () => (this.iris = this.time.now))
    this.time.delayedCall(10800, () => this.credits())
  }

  update(_time: number, delta: number) {
    // the shot eases in from the island's zoom, and the sea settles from the speed they left at
    if (!this.opened) this.opened = this.time.now
    const p = Math.min(1, (this.time.now - this.opened) / IN)
    const s = p * p * (3 - 2 * p) // smoothstep: no kick as the zoom starts, none as it lands
    const zoom = OPEN + (ZOOM - OPEN) * s
    this.crew.setScale(zoom)
    this.water.setTileScale(zoom)
    // tile pixels, so the sea crosses the screen at the same speed however far in the shot is
    this.water.tilePositionX += ((RUSH + (CRUISE - RUSH) * s) / zoom) * (delta / 1000)
    const r = this.iris < 0 ? 480 : Math.max(0, 480 - ((this.time.now - this.iris) / 2400) * 480)
    this.hole
      .clear()
      .fillStyle(0xffffff)
      .fillCircle(MID, DECK - 8 * ZOOM, r)

    const press = Phaser.Input.Keyboard.JustDown(this.enter)
    if (this.again && press) {
      load(createWorld()) // a clean island, and the rowboat comes in again
      this.scene.start('intro')
      return
    }
    // the offer to go round again is the end of the line: it waits for Enter and nothing else
    if (!this.again && this.ready >= 0 && (press || this.time.now - this.ready >= 4000)) this.next()
  }

  // names, then each card, then the black on its own before the offer to go round again
  private next() {
    this.ready = -1
    const last = this.card === CARDS.length - 1
    this.fade(this.text, last ? 1200 : 500)
    this.text = []
    this.card += 1
    if (!last) {
      this.time.delayedCall(600, () => this.show([this.line(CARDS[this.card])], 900))
      return
    }
    // the black holds on its own for 4 s after the last card has gone
    this.time.delayedCall(5200, () => {
      const play = this.line('Play again?')
      // the chevron sits off the left of the line, the way a menu cursor does, and nudges at it
      const chevron = this.line('>').setX(play.x - play.width / 2 - 16)
      this.show([play, chevron], 800)
      this.tweens.add({
        targets: chevron,
        x: chevron.x + 3,
        duration: 500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
      this.again = true
    })
  }

  private line(text: string) {
    return this.add.bitmapText(MID, 172, 'nihonium', text).setOrigin(0.5, 0)
  }

  // fade a card up on the black, and mark when it is up so the next one can follow
  private show(what: Phaser.GameObjects.BitmapText[], ms: number) {
    this.text = what
    what.forEach((t) => t.setDepth(101).setAlpha(0))
    this.tweens.add({
      targets: this.text,
      alpha: 1,
      duration: ms,
      onComplete: () => (this.ready = this.time.now),
    })
  }

  private fade(what: Phaser.GameObjects.GameObject[], ms: number) {
    if (!what.length) return
    this.tweens.add({
      targets: what,
      alpha: 0,
      duration: ms,
      onComplete: () => what.forEach((t) => t.destroy()),
    })
  }

  // one small heart between them, drifting side to side as it goes up and fading out at the top.
  // It rides in the crew container, so 2/3 of the settled 3x shot draws it at a crisp 2x.
  private heart() {
    const heart = this.add.image(7, -14, 'sprites/heart').setScale(2 / 3)
    this.crew.add(heart)
    this.tweens.add({
      targets: heart,
      y: heart.y - 30,
      duration: 2600,
      ease: 'Sine.easeOut',
      onComplete: () => heart.destroy(),
    })
    this.tweens.add({
      targets: heart,
      x: heart.x - 4,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })
    this.tweens.add({ targets: heart, alpha: 0, duration: 1100, delay: 1400 })
  }

  // the names, a pair at a time, each fading up slowly on the black the spotlight left behind
  private credits() {
    const all: Phaser.GameObjects.BitmapText[] = []
    CREDITS.forEach(([job, name], i) => {
      const y = 72 + i * 60
      all.push(
        this.add.bitmapText(MID, y, 'nihonium', job).setOrigin(0.5, 0).setTint(0x7a8a9a),
        this.add.bitmapText(MID, y + 20, 'nihonium', name).setOrigin(0.5, 0),
      )
    })
    all.forEach((line) => line.setDepth(101).setAlpha(0))
    this.text = all
    CREDITS.forEach((_, i) => {
      this.tweens.add({
        targets: all.slice(i * 2, i * 2 + 2),
        alpha: 1,
        duration: 1200,
        delay: i * 900,
        onComplete: i === CREDITS.length - 1 ? () => (this.ready = this.time.now) : undefined,
      })
    })
  }
}
