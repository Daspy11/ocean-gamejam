import Phaser from 'phaser'
import { DUAL_FRAME } from '../assets'
import { KINDS, tileAt, type Dir, type Tile } from '../game/world'
import { dispatch, world } from '../store'

// priority, lowest first; later fills draw over earlier ones, so each layer's mask counts every
// terrain above it as itself
const GROUND: Tile[] = ['water', 'salt', 'sand', 'grass', 'charred', 'farm', 'rock']
const ROW = { down: 0, left: 1, right: 2, up: 3 } // character sheet row per facing
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const
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
  // one per orb still boiling its tile, with the bottom of that tile to rise from and the time the
  // orb was thrown, if it was: nothing boils until it has landed
  private smoke: { sprite: Phaser.GameObjects.Sprite; bottom: number; thrownAt?: number }[] = []
  // one per flower mid-bloom: a white copy fading in over the coloured sprite, both vibrating
  private blooms: {
    base: Phaser.GameObjects.Sprite
    white: Phaser.GameObjects.Sprite
    bloomAt: number
    x: number
  }[] = []
  // one per tree, with the times it was last shaken and started flying off or coming down, and the
  // upside-down smoke a tree in flight rides on
  private trees: {
    sprite: Phaser.GameObjects.Sprite
    smoke: Phaser.GameObjects.Sprite | null
    x: number
    feet: number
    shookAt?: number
    flyAt?: number
    landAt?: number
  }[] = []
  // one per world.pops entry, with the sim time it started and the y it floats up from
  private pops: { text: Phaser.GameObjects.BitmapText; at: number; baseY: number }[] = []
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
    // a click only ever advances the box on screen: it must never interact with the world
    this.input.on('pointerdown', () => {
      if (world.dialogue) dispatch({ type: 'interact' })
    })

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

    // the screen shake: a jitter off sim time, so it is the same every run and needs no tween
    const rumbling = world.time < world.rumble
    const jitter = (every: number) =>
      rumbling ? ((Math.floor(world.time / every) % 3) - 1) * 2 : 0
    this.cameras.main.followOffset.set(-8 + jitter(30), 8 + jitter(50))

    // clouds off the boiling sea: a 900 ms rise, driven from sim time so there is nothing to tween
    const rise = (world.time % 900) / 900
    for (const { sprite, bottom, thrownAt } of this.smoke)
      sprite
        .setFrame(Math.floor(world.time / 200) % 3)
        .setY(bottom - 8 - rise * 10)
        .setAlpha(1 - rise)
        .setVisible(thrownAt === undefined || world.time - thrownAt >= 300) // it boils once it lands

    // a thrown orb flies over from the tile it left on, on a 300 ms arc 12 px high
    world.objects.forEach((o, i) => {
      if (o.kind !== 'orb' || o.thrown === undefined || !this.objects[i]) return
      const t = Math.min(1, (world.time - o.thrown.at) / 300)
      this.objects[i].setPosition(
        (o.thrown.x + (o.x - o.thrown.x) * t) * 16,
        (o.thrown.y + (o.y - o.thrown.y) * t + 1) * 16 - 4 * t * (1 - t) * 12,
      )
    })

    // the shelling: a ball flies straight down out of the muzzle at 24 tiles a second, glowing red
    // to white as it goes, and the cannon rocks where it stands while it is firing
    const heat = Math.round(((Math.sin(world.time / 50) + 1) / 2) * 255)
    world.objects.forEach((o, i) => {
      const sprite = this.objects[i]
      if (!sprite) return
      const shudder = Math.floor(world.time / 40) % 2 ? 1 : -1
      if (o.kind === 'cannon' && o.firing) sprite.setX(o.x * 16 + shudder)
      if (o.kind !== 'ball') return
      sprite
        .setY((o.y + 1) * 16 + Math.max(0, world.time - o.at) * 0.384)
        .setDepth(9000) // in the air, so it flies over everything
        .setTint(0xff0000 | (heat << 8) | heat)
    })

    // a bloom crossfades to white over its 1500 ms and shakes a pixel each way, both off sim time
    for (const { base, white, bloomAt, x } of this.blooms) {
      const at = x + (Math.floor(world.time / 40) % 2 ? 1 : -1)
      base.setX(at)
      white.setX(at).setAlpha(Math.min(1, Math.max(0, (world.time - bloomAt) / 1500)))
    }

    // a shaken tree jitters for 400 ms, and one in flight rides 96 px up or down over its 1500 ms
    // on the sea's own steam turned upside down, so the cloud drifts away below it
    for (const { sprite, smoke, x, feet, shookAt, flyAt, landAt } of this.trees) {
      const trip = flyAt ?? landAt
      const p = trip === undefined ? 1 : Math.min(1, Math.max(0, (world.time - trip) / 1500))
      const lift = (flyAt !== undefined ? p : landAt !== undefined ? 1 - p : 0) * 96
      const shaking = shookAt !== undefined && world.time - shookAt < 400
      sprite.setX(x + (shaking ? (Math.floor(world.time / 40) % 2 ? 1 : -1) : 0)).setY(feet - lift)
      smoke
        ?.setFrame(Math.floor(world.time / 200) % 3)
        .setY(feet - lift + 2 + rise * 10)
        .setAlpha(1 - rise)
        .setVisible(p < 1)
    }

    // a pop drifts 12 px up over its 1500 ms life, fading out; sim time drives it, so no tweens
    for (const { text, at, baseY } of this.pops) {
      const age = world.time - at
      text.setY(baseY - (age / 1500) * 12).setAlpha(1 - age / 1500)
    }
  }

  // everything moving on the grid: the player, npcs, and a boat under sail. this.objects[i] lines
  // up with world.objects[i], sync maps them in order
  private drawActors() {
    this.draw(this.player, world.player)
    world.objects.forEach((o, i) => {
      const sprite = this.objects[i]
      if (!sprite) return
      // a rider shares the boat's tile, so lift him one depth over the deck he is standing on
      if (o.kind === 'npc') this.draw(sprite, o, o.sprite, o.ride ? 1 : 0)
      // a boat under sail moves like an actor, but its frame is the hull's state, set by sync()
      else if (o.kind === 'boat' && o.step) {
        const y = (o.y + (o.step.y - o.y) * o.step.t) * 16 + 16
        sprite.setPosition((o.x + (o.step.x - o.x) * o.step.t) * 16, y).setDepth(y)
      }
    })
  }

  // position and frame are pure functions of the world, so there are no tweens and no animations
  private draw(sprite: Phaser.GameObjects.Sprite, a: Actor, who = '', lift = 0) {
    const x = (a.step ? a.x + (a.step.x - a.x) * a.step.t : a.x) * 16
    const y = (a.step ? a.y + (a.step.y - a.y) * a.step.t : a.y) * 16
    const col = a.step ? (a.step.t < 0.5 ? (a.parity ? 0 : 2) : 1) : 1 // 1 is standing
    // the crab scuttles sideways whichever way he is going and turns to face you when he stops;
    // the pirate is blind, so he is always drawn looking the opposite way to the one he faces
    const facing =
      who === 'walter'
        ? !a.step
          ? 'down'
          : a.facing === 'left'
            ? 'left'
            : 'right'
        : who === 'etarp'
          ? OPP[a.facing]
          : a.facing
    sprite
      .setPosition(x, y + 16)
      .setDepth(y + 16 + lift)
      .setFrame(ROW[facing] * 3 + col)
  }

  private sync() {
    for (let n = 1; n < GROUND.length; n++) {
      // a higher terrain counts as every terrain below it, so a rounded corner never opens onto water
      const is = (x: number, y: number, bit: number) => {
        const tile = tileAt(world, x, y) // undefined off the map: nothing there
        return tile && GROUND.indexOf(tile) >= n ? bit : 0
      }
      for (let j = 0; j <= world.height; j++)
        for (let i = 0; i <= world.width; i++)
          // the dual cell's centre sits on the corner shared by these four logical tiles; -1 (no
          // corner is this terrain or higher) clears the cell
          this.layers[n].putTileAt(
            DUAL_FRAME[is(i - 1, j - 1, 1) + is(i, j - 1, 2) + is(i - 1, j, 4) + is(i, j, 8)],
            i,
            j,
          )
    }

    for (const sprite of this.objects) sprite.destroy()
    for (const { sprite } of this.smoke) sprite.destroy()
    for (const { white } of this.blooms) white.destroy() // the base is in this.objects, destroyed above
    for (const { smoke } of this.trees) smoke?.destroy() // ditto the tree itself
    for (const { text } of this.pops) text.destroy()
    this.pops = world.pops.map((p) => {
      const baseY = p.y * 16
      const text = this.add
        .bitmapText(p.x * 16 + 8, baseY, 'basis33', p.text)
        .setOrigin(0.5, 1)
        .setDepth(10000) // score pops always read over everything
      return { text, at: p.at, baseY }
    })
    this.smoke = []
    for (const o of world.objects) {
      // an orb still boiling its tile, and the desalinator chugging away on dry land
      if (o.kind !== 'machine' && (o.kind !== 'orb' || tileAt(world, o.x, o.y) !== 'water'))
        continue
      const bottom = (o.y + 1) * 16
      const sprite = this.add
        .sprite(o.x * 16, bottom, 'sprites/smoke')
        .setOrigin(0, 1)
        .setDepth(bottom + 1) // just over the orb it rises from
        .setVisible(false) // update() shows it as soon as the orb has landed
      this.smoke.push({ sprite, bottom, thrownAt: o.kind === 'orb' ? o.thrown?.at : undefined })
    }
    this.objects = world.objects.map((o) => {
      const feet = (o.y + KINDS[o.kind].h) * 16 // depth is the bottom of the footprint, so tall art overlaps
      let frame = 0 // frame 0 unless the kind has some state to show
      if (o.kind === 'crate') frame = o.open ? 1 : 0
      if (o.kind === 'boat' && o.wrecked) frame = 1 // the stove-in hull
      if (o.kind === 'flower' && o.white) frame = 1
      if (o.kind === 'bar' && o.drink) frame = 1 // the cocktail stood on the counter
      if (o.kind === 'npc') frame = ROW[o.facing] * 3 + 1 // standing; draw() takes it from here
      // flags['sprite:<id>'] draws an npc off another sheet: the shrimp once he has his deck chair
      const skin = world.flags[`sprite:${o.id}`]
      const sheet = o.kind !== 'npc' ? o.kind : typeof skin === 'string' ? skin : o.sprite
      return (
        this.add
          .sprite(o.x * 16, feet, `sprites/${sheet}`, frame)
          .setOrigin(0, 1)
          // a floor lies flat on the ground, so he walks over it rather than behind it
          .setDepth(o.kind === 'floor' ? feet - 1 : feet)
      )
    })
    this.trees = []
    world.objects.forEach((o, i) => {
      if (o.kind !== 'tree') return
      const base = this.objects[i]
      const flying = o.flyAt !== undefined || o.landAt !== undefined
      const smoke = !flying
        ? null
        : this.add
            .sprite(base.x, base.y, 'sprites/smoke')
            .setOrigin(0, 0) // it hangs under the trunk rather than rising from the ground
            .setFlipY(true)
            .setDepth(base.depth + 1)
      const { shookAt, flyAt, landAt } = o
      this.trees.push({ sprite: base, smoke, x: o.x * 16, feet: base.y, shookAt, flyAt, landAt })
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
