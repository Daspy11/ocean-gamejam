import Phaser from 'phaser'
import { createWorld } from '../game/world'
import { load } from '../store'

// The names, drawn over the flight rather than in place of it: the island scene launches this once
// the ride is done and keeps flying underneath, so the spotlight closes on a shot that is still
// moving. Then the cards, and the offer to go round again.

const MID = 320 // the middle of the canvas, which is where the flight scene holds the carpet
const EYE = 150 // and the y the two of them ride at, which is what the spotlight closes on
const SHUT = 2400 // ms the spotlight takes to close

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
  private hole!: Phaser.GameObjects.Graphics
  private iris = -1 // when the spotlight started closing; the clock has not ticked yet in create
  private enter!: Phaser.Input.Keyboard.Key
  private card = -1 // which of CARDS is up; -1 while the names are still the whole screen
  private text: Phaser.GameObjects.GameObject[] = [] // whatever is on the black right now
  private ready = -1 // when what is up finished fading in, so it can move on 4 s later; -1 waiting
  private again = false // the last card is up and Enter starts the game over

  constructor() {
    super('outro')
  }

  create() {
    this.card = -1
    this.text = []
    this.ready = -1
    this.again = false
    this.enter = this.input.keyboard!.addKey('ENTER')

    // the spotlight closes on the party, and the names come up on the black it leaves behind
    this.hole = this.make.graphics({ x: 0, y: 0 })
    const black = this.add.rectangle(0, 0, 640, 360, 0x000000).setOrigin(0).setDepth(100)
    const mask = this.hole.createGeometryMask()
    mask.setInvertAlpha(true) // black everywhere the circle is not
    black.setMask(mask)
    this.iris = -1
    this.time.delayedCall(SHUT + 800, () => this.credits()) // a beat of black before the first name
  }

  update() {
    if (this.iris < 0) this.iris = this.time.now // the clock only starts once the scene is up
    const r = Math.max(0, 480 - ((this.time.now - this.iris) / SHUT) * 480)
    this.hole.clear().fillStyle(0xffffff).fillCircle(MID, EYE, r)

    const press = Phaser.Input.Keyboard.JustDown(this.enter)
    if (this.again && press) {
      load(createWorld()) // a clean island, and the rowboat comes in again
      this.scene.stop('island') // the flight is still going on under all this
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
