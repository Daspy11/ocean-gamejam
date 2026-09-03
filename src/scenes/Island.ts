import Phaser from 'phaser'
import { DUAL_FRAME } from '../assets'
import { KINDS, tileAt, type Dir, type Tile } from '../game/world'
import { dispatch, world } from '../store'

const GROUND: Tile[] = ['water', 'salt', 'sand', 'grass'] // priority, lowest first; later fills draw over earlier ones
const ROW = { down: 0, left: 1, right: 2, up: 3 } // character sheet row per facing
// anything drawn walking on the grid: the player, and npcs a cutscene is walking
type Actor = {
  x: number
  y: number
  facing: Dir
  step?: null | { x: number; y: number; t: number }
  parity?: boolean
}

export default class Island extends Phaser.Scene {
  private rev = -1
  private layers: Phaser.Tilemaps.TilemapLayer[] = []
  private player!: Phaser.GameObjects.Sprite
  private objects: Phaser.GameObjects.Sprite[] = []
  // one per orb still boiling its tile, with the bottom of that tile to rise from
  private smoke: { sprite: Phaser.GameObjects.Sprite; bottom: number }[] = []
  // one per flower mid-bloom: a white copy fading in over the coloured sprite, both vibrating
  private blooms: {
    base: Phaser.GameObjects.Sprite
    white: Phaser.GameObjects.Sprite
    bloomAt: number
    x: number
  }[] = []
  // one per world.pops entry, with the sim time it started and the y it floats up from
  private pops: { text: Phaser.GameObjects.Text; at: number; baseY: number }[] = []
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private sent: { dir: Dir | null; run: boolean } = { dir: null, run: false }

  constructor() {
    super('island')
  }

  create() {
    this.scene.launch('ui') // so a direct scene.start('island') still brings the HUD along
    GROUND.forEach((terrain, n) => {
      // every terrain above the base is a dual grid: (W+1)x(H+1) cells shifted half a tile up and left
      const map = this.make.tilemap({
        tileWidth: 16,
        tileHeight: 16,
        width: world.width + (n ? 1 : 0),
        height: world.height + (n ? 1 : 0),
      })
      const layer = map.createBlankLayer(terrain, map.addTilesetImage(`tiles/${terrain}`)!)!
      if (n) layer.setPosition(-8, -8)
      else layer.fill(0, 0, 0, world.width, world.height)
      this.layers.push(layer)
    })

    this.player = this.add.sprite(0, 0, 'sprites/player', 1).setOrigin(0, 1)

    this.cameras.main.setZoom(2)
    this.cameras.main.setBounds(0, 0, world.width * 16, world.height * 16)
    // the sprite's origin is its feet, so offset the follow back to the centre of the player's tile
    this.cameras.main.startFollow(this.player, true, 1, 1, -8, 8)

    this.keys = this.input.keyboard!.addKeys(
      'UP,DOWN,LEFT,RIGHT,W,A,S,D,SHIFT,E,SPACE,ENTER,I,TAB,ESC',
    ) as Record<string, Phaser.Input.Keyboard.Key>

    this.sync()
    this.drawActors()
    this.rev = world.rev
  }

  update(_time: number, delta: number) {
    const dirs: [Dir, Phaser.Input.Keyboard.Key[]][] = [
      ['up', [this.keys.UP, this.keys.W]],
      ['down', [this.keys.DOWN, this.keys.S]],
      ['left', [this.keys.LEFT, this.keys.A]],
      ['right', [this.keys.RIGHT, this.keys.D]],
    ]
    // the most recently pressed direction wins, so rolling from one key to another never sticks
    let dir: Dir | null = null
    let at = 0
    for (const [d, keys] of dirs)
      for (const key of keys)
        if (key.isDown && key.timeDown >= at) {
          at = key.timeDown
          dir = d
        }
    const run = this.keys.SHIFT.isDown
    if (dir !== this.sent.dir || run !== this.sent.run) {
      this.sent = { dir, run }
      dispatch({ type: 'move', dir, run })
    }

    const down = (keys: Phaser.Input.Keyboard.Key[]) =>
      keys.some((key) => Phaser.Input.Keyboard.JustDown(key))
    if (down([this.keys.E, this.keys.SPACE, this.keys.ENTER])) dispatch({ type: 'interact' })
    if (down([this.keys.I, this.keys.TAB, this.keys.ESC])) dispatch({ type: 'menu' })

    dispatch({ type: 'tick', dt: delta })

    if (world.rev !== this.rev) {
      this.rev = world.rev
      this.sync()
    }
    this.drawActors()

    // clouds off the boiling sea: a 900 ms rise, driven from sim time so there is nothing to tween
    const rise = (world.time % 900) / 900
    for (const { sprite, bottom } of this.smoke)
      sprite
        .setFrame(Math.floor(world.time / 200) % 3)
        .setY(bottom - 8 - rise * 10)
        .setAlpha(1 - rise)

    // a bloom crossfades to white over its 1500 ms and shakes a pixel each way, both off sim time
    for (const { base, white, bloomAt, x } of this.blooms) {
      const at = x + (Math.floor(world.time / 40) % 2 ? 1 : -1)
      base.setX(at)
      white.setX(at).setAlpha(Math.min(1, Math.max(0, (world.time - bloomAt) / 1500)))
    }

    // a pop drifts 12 px up over its 1500 ms life, fading out; sim time drives it, so no tweens
    for (const { text, at, baseY } of this.pops) {
      const age = world.time - at
      text.setY(baseY - (age / 1500) * 12).setAlpha(1 - age / 1500)
    }
  }

  // the player and every npc; this.objects[i] lines up with world.objects[i], sync maps them in order
  private drawActors() {
    this.draw(this.player, world.player)
    world.objects.forEach((o, i) => {
      if (o.kind === 'npc' && this.objects[i]) this.draw(this.objects[i], o, o.sprite === 'walter')
    })
  }

  // position and frame are pure functions of the world, so there are no tweens and no animations
  private draw(sprite: Phaser.GameObjects.Sprite, a: Actor, crab = false) {
    const x = (a.step ? a.x + (a.step.x - a.x) * a.step.t : a.x) * 16
    const y = (a.step ? a.y + (a.step.y - a.y) * a.step.t : a.y) * 16
    const col = a.step ? (a.step.t < 0.5 ? (a.parity ? 0 : 2) : 1) : 1 // 1 is standing
    // a crab scuttles sideways whichever way he is going, and turns to face you when he stops
    const facing = crab ? (!a.step ? 'down' : a.facing === 'left' ? 'left' : 'right') : a.facing
    sprite
      .setPosition(x, y + 16)
      .setDepth(y + 16)
      .setFrame(ROW[facing] * 3 + col)
  }

  private sync() {
    for (let n = 1; n < GROUND.length; n++) {
      const terrain = GROUND[n]
      const is = (x: number, y: number, bit: number) => (tileAt(world, x, y) === terrain ? bit : 0)
      for (let j = 0; j <= world.height; j++)
        for (let i = 0; i <= world.width; i++)
          // the dual cell's centre sits on the corner shared by these four logical tiles; -1 (none
          // of them is this terrain) clears the cell
          this.layers[n].putTileAt(
            DUAL_FRAME[is(i - 1, j - 1, 1) + is(i, j - 1, 2) + is(i - 1, j, 4) + is(i, j, 8)],
            i,
            j,
          )
    }

    for (const sprite of this.objects) sprite.destroy()
    for (const { sprite } of this.smoke) sprite.destroy()
    for (const { white } of this.blooms) white.destroy() // the base is in this.objects, destroyed above
    for (const { text } of this.pops) text.destroy()
    this.pops = world.pops.map((p) => {
      const baseY = p.y * 16
      const text = this.add
        .text(p.x * 16 + 8, baseY, p.text, {
          fontFamily: 'monospace',
          fontSize: 8,
          resolution: 1,
          color: '#ffffff',
        })
        .setOrigin(0.5, 1)
        .setDepth(10000) // score pops always read over everything
      return { text, at: p.at, baseY }
    })
    this.smoke = world.objects
      .filter((o) => o.kind === 'orb' && tileAt(world, o.x, o.y) === 'water') // still boiling
      .map((o) => {
        const bottom = (o.y + 1) * 16
        const sprite = this.add
          .sprite(o.x * 16, bottom, 'sprites/smoke')
          .setOrigin(0, 1)
          .setDepth(bottom + 1) // just over the orb it rises from
        return { sprite, bottom }
      })
    this.objects = world.objects.map((o) => {
      const feet = (o.y + KINDS[o.kind].h) * 16 // depth is the bottom of the footprint, so tall art overlaps
      let frame = 0 // frame 0 unless the kind has some state to show
      if (o.kind === 'crate') frame = o.open ? 1 : 0
      if (o.kind === 'flower' && o.white) frame = 1
      if (o.kind === 'npc') frame = ROW[o.facing] * 3 + 1 // standing; draw() takes it from here
      return this.add
        .sprite(o.x * 16, feet, `sprites/${o.kind === 'npc' ? o.sprite : o.kind}`, frame)
        .setOrigin(0, 1)
        .setDepth(feet)
    })
    this.blooms = []
    world.objects.forEach((o, i) => {
      if (o.kind !== 'flower' || o.bloomAt === undefined || o.white) return
      const base = this.objects[i]
      const white = this.add
        .sprite(base.x, base.y, 'sprites/flower', 1)
        .setOrigin(0, 1)
        .setDepth(base.depth + 0.5) // right over the coloured flower it fades in on top of
        .setAlpha(0)
      this.blooms.push({ base, white, bloomAt: o.bloomAt, x: o.x * 16 })
    })
  }
}
