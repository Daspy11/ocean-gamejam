import Phaser from 'phaser'
import { revealed } from '../game/script'
import { createWorld } from '../game/world'
import { load, settings } from '../store'
import { bindControls, openSettings } from './Settings'
import { background, playChime, speak, stopSpeech, type Speech } from './speech'

// assets/text/intro.json is read verbatim; the island takes over the crash once they reach shore.
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
  private wrapped = ''
  private typingAt = 0
  private complete = false
  private voiceCount = 0
  private speech: Speech = { until: 0 }
  private controls!: ReturnType<typeof bindControls>
  private seat = 0 // the y the crew rest at, so a hop always returns to it
  private title: {
    music: Phaser.Sound.BaseSound
    boat: Phaser.GameObjects.Image
    layer: Phaser.GameObjects.Container
    options: Phaser.GameObjects.BitmapText[]
    marker: Phaser.GameObjects.BitmapText
    cursor: number
    startedAt: number | null
  } | null = null

  constructor() {
    super('intro')
  }

  create(data: { title?: boolean } = {}) {
    this.line = 0
    this.ending = false
    this.title = null
    stopSpeech(this.speech)
    const silence = () => stopSpeech(this.speech)
    const resume = (elapsed: number) => {
      this.typingAt += elapsed
      if (this.title?.startedAt != null) this.title.startedAt += elapsed
    }
    this.events.on('settings-resume', resume)
    this.events.on('pause', silence)
    this.events.once('shutdown', () => {
      silence()
      this.events.off('pause', silence)
      this.events.off('settings-resume', resume)
    })
    this.script = this.cache.json.get('text/intro')

    // no camera zoom here: the art carries ZOOM and the box is drawn at 1x on top of it
    this.water = this.add.tileSprite(0, 0, 640, 360, 'tiles/water').setOrigin(0).setTileScale(ZOOM)

    // The title leaves room for its options beside the boat; dialogue brings it back to centre.
    const boat = this.add
      .image((640 - 32 * ZOOM) / 2 + (data.title ? 168 : 0), data.title ? 272 : 208, 'sprites/boat')
      .setOrigin(0, 1)
      .setScale(ZOOM)
    this.seat = boat.y - SEAT * ZOOM
    this.actors = {
      // frame 9: standing, facing right, the way the boat is rowing
      mich: this.add.image(boat.x, this.seat, 'sprites/mich', 9).setOrigin(0, 1).setScale(ZOOM),
      player: this.add
        .image(boat.x + 15 * ZOOM, this.seat, 'sprites/player', 9)
        .setOrigin(0, 1)
        .setScale(ZOOM),
      orb: this.add
        .image(boat.x + 8 * ZOOM, this.seat, 'sprites/orb')
        .setOrigin(0, 1)
        .setScale(ZOOM),
    }
    // the bob and the surge are in screen pixels, so they scale with the art. The boat is added last
    // so it draws on top: its near gunwale cuts across their legs and they read as sat down in it.
    this.crew = this.add.container(-5 * ZOOM, -3 * ZOOM, [
      this.actors.orb,
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

    this.controls = bindControls(this)
    if (data.title) {
      const music = this.sound.add('music/nowhereland', {
        loop: true,
        volume: 0.6,
        mute: !settings.music,
      })
      music.play()
      this.events.once('shutdown', () => music.destroy())
      for (const part of [this.box, this.who, this.body]) part.setVisible(false)
      const logo = this.add.image(320, 120, 'sprites/logo')
      this.tweens.add({
        targets: logo,
        y: 126,
        duration: 1100,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
      const labels = this.cache.json.get('text/title')
      const options = [labels.start, 'settings'].map((label, i) =>
        this.add
          .bitmapText(320, 232 + i * 44, 'nihonium', label, 24)
          .setOrigin(0.5, 0)
          .setDropShadow(2, 2, 0x1a1c2c, 1),
      )
      const marker = this.add
        .bitmapText(320 - options[0].width / 2 - 16, 232, 'nihonium', '>', 24)
        .setOrigin(0.5, 0)
        .setDropShadow(2, 2, 0x1a1c2c, 1)
      this.title = {
        music,
        boat,
        layer: this.add.container(0, 0, [logo, ...options, marker]),
        options,
        marker,
        cursor: 0,
        startedAt: null,
      }
      return
    }
    background(this)
    this.show()
  }

  update() {
    this.water.tilePositionX += 0.7 // the sea rushes past: they are rowing hard
    if (settings.open) return
    const input = this.controls(this.title === null)
    if (input.settings) {
      openSettings(this, !!this.title && this.title.startedAt === null)
      return
    }
    if (this.title) {
      const title = this.title
      if (title.startedAt !== null) {
        const elapsed = this.time.now - title.startedAt
        const t = Math.min(1, elapsed / 2000)
        const fade = 1 - t * t * (3 - 2 * t)
        title.layer.setAlpha(fade)
        // Move the whole crew's resting position while its container keeps bobbing independently.
        title.boat.setX((640 - 32 * ZOOM) / 2 + 168 * fade).setY(208 + 64 * fade)
        this.seat = title.boat.y - SEAT * ZOOM
        this.actors.mich.setX(title.boat.x).setY(this.seat)
        this.actors.player.setX(title.boat.x + 15 * ZOOM).setY(this.seat)
        this.actors.orb.setX(title.boat.x + 8 * ZOOM).setY(this.seat)
        if (t === 1) {
          title.layer.destroy()
          this.title = null
          for (const part of [this.box, this.who, this.body]) part.setVisible(true)
          this.show()
        }
        return
      }
      if (input.up || input.down) title.cursor = 1 - title.cursor
      if ((input.up || input.down) && !input.confirm) playChime(this)
      const option = title.options[title.cursor]
      const nudge = (1 - Math.cos((this.time.now * Math.PI) / 500)) * 1.5
      title.marker.setX(option.x - option.width / 2 - 16 + nudge).setY(option.y)
      if (!input.confirm) return
      if (title.cursor === 1) {
        openSettings(this, true)
      } else {
        playChime(this)
        settings.confirmLabel = input.confirmLabel ?? 'E'
        load(createWorld())
        title.startedAt = this.time.now
        this.tweens.add({
          targets: title.music,
          volume: 0,
          duration: 2000,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            title.music.destroy()
            background(this)
          },
        })
        title.marker.setVisible(false)
      }
      return
    }
    if (this.ending) return
    const advance = input.confirm
    const text = this.script.lines[this.line].text
    const count = this.complete ? text.length : revealed(text, this.time.now - this.typingAt)
    const who = this.script.cast[this.script.lines[this.line].who]?.name ?? ''
    if (!this.complete && !advance) speak(this, who, text, this.voiceCount, count, this.speech)
    else stopSpeech(this.speech)
    this.voiceCount = count
    this.body.setText(count < text.length ? this.wrapped.slice(0, count) : this.wrapped)
    if (!advance) return
    if (count < text.length) {
      this.complete = true
      this.body.setText(this.wrapped)
      return
    }
    this.line++
    if (this.line < this.script.lines.length) this.show()
    else this.crash()
  }

  private show() {
    stopSpeech(this.speech)
    this.actors.player.setFrame(5) // look back at Mich while they talk across the boat
    const line = this.script.lines[this.line]
    this.who.setText(this.script.cast[line.who]?.name ?? '') // cast names, so the lead reads 'You'
    this.body.setText([line.text, '', `[${settings.confirmLabel}] continue`].join('\n'))
    this.wrapped = this.body.getTextBounds().wrappedText
    const height = Math.max(112, this.body.height + 40)
    this.box.setSize(624, height).setY(352 - height)
    this.who.setY(360 - height)
    this.typingAt = this.time.now
    this.voiceCount = 0
    this.complete = !this.script.cast[line.who]?.name
    this.body.setY(376 - height).setText(this.complete ? this.wrapped : '')
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
    this.actors.player.setFrame(9)
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
