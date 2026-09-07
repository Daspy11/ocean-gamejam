import Phaser from 'phaser'
import { KINDS, tileAt, type Dir, type Obj } from '../game/world'
import { dispatch, world } from '../store'
import { crashIn, deck, inTheAir, shade } from './crash'
import { makeGround, syncGround } from './ground'
import { flyOut } from './leave'
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
  private shadow!: Phaser.GameObjects.Sprite // the shade under Tarq's carpet, the one thing that flies
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
  private arriving = false // the crash is playing: the world is frozen and nothing takes input
  private leaving = false // and the carpet is flying out east, on its way into the Outro scene

  constructor() {
    super('island')
  }

  create() {
    this.scene.launch('ui') // so a direct scene.start('island') still brings the HUD along
    this.layers = makeGround(this)

    this.player = this.add.sprite(0, 0, 'sprites/player', 1).setOrigin(0, 1)
    this.shadow = this.add.sprite(0, 0, 'sprites/shadow').setOrigin(0.5, 0.5).setAlpha(0.35)

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
    // the intro hands over mid-crash: the boat lands them here, and then they start arguing
    if ((this.scene.settings.data as { crash?: boolean }).crash) this.crash()
  }

  update(_time: number, delta: number) {
    // the ending: the carpet flies east out over the sea and the Outro scene takes the shot on
    if (world.flags.outro && !this.leaving)
      this.leaving = flyOut(this, this.objects, this.player, this.shadow)
    if (this.arriving || this.leaving) return // the cutscene tweens own the sprites and the camera
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
      for (const key of keys) if (key.isDown && key.timeDown >= at) [at, dir] = [key.timeDown, d]
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
    const jitter = (every: number) =>
      world.time < world.rumble ? ((Math.floor(world.time / every) % 3) - 1) * 2 : 0
    // a burst close-up has no black: over its first second the camera eases from the player at
    // 2x to whoever it is of at 7.5x, so the ground he stands on is the backdrop and the big sheet
    // the UI scene draws lands right on his tile
    const cam = this.cameras.main
    const star = this.closeupOf()
    const c = world.closeup
    if (star && c) {
      // in over the first second, and back out over the second after it is taken down
      const p =
        c.down === undefined
          ? Math.min(1, (world.time - c.since) / 1000)
          : Math.max(0, 1 - (world.time - c.down) / 1000)
      const s = p * p * (3 - 2 * p) // smoothstep: slow off the mark and slow to settle
      cam.setZoom(2 + ((c.zoom ?? 7.5) - 2) * s)
      cam.roundPixels = false // a whole world pixel is a 7.5 px lurch at full zoom
      const [px, py] = [this.player.x + 8, this.player.y - 8] // his tile's centre, feet origin
      const [x, y] = [star.x * 16 + 8, star.y * 16 + 8]
      cam.followOffset.set(-8 - (x - px) * s, 8 - (y - py) * s)
    } else {
      cam.setZoom(2)
      cam.roundPixels = true
      cam.followOffset.set(-8 + jitter(30), 8 + jitter(50))
    }

    // clouds off the boiling sea: a 900 ms rise, driven from sim time so there is nothing to tween
    const rise = (world.time % 900) / 900
    for (const { sprite, bottom, thrownAt } of this.smoke)
      sprite
        .setFrame(Math.floor(world.time / 200) % 3)
        .setY(bottom - 8 - rise * 10)
        .setAlpha(1 - rise)
        .setVisible(thrownAt === undefined || world.time - thrownAt >= 300) // it boils once it lands

    // anything thrown flies over from the tile it left on, on a 300 ms arc 12 px high
    world.objects.forEach((o, i) => {
      if (o.kind === 'npc' || o.thrown === undefined || !this.objects[i]) return
      const t = Math.min(1, (world.time - o.thrown.at) / 300)
      this.objects[i].setPosition(
        (o.thrown.x + (o.x - o.thrown.x) * t) * 16,
        (o.thrown.y + (o.y - o.thrown.y) * t + 1) * 16 - 4 * t * (1 - t) * 12,
      )
    })

    // the shelling: a ball flies straight out of the muzzle at 24 tiles a second along its own
    // angle, glowing red to white as it goes, and the cannon rocks where it stands while it fires
    const heat = Math.round(((Math.sin(world.time / 50) + 1) / 2) * 255)
    world.objects.forEach((o, i) => {
      const sprite = this.objects[i]
      if (!sprite) return
      const shudder = Math.floor(world.time / 40) % 2 ? 1 : -1
      if (o.kind === 'cannon' && o.firing) sprite.setX(o.x * 16 + shudder)
      if (o.kind !== 'ball') return
      const flown = Math.max(0, world.time - o.at) * 0.384
      const rad = (o.dir * Math.PI) / 180
      sprite
        .setPosition(o.x * 16 - flown * Math.cos(rad), (o.y + 1) * 16 + flown * Math.sin(rad))
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

  // the rowboat's arrival, drawn on top of the world it has already landed in
  private crash() {
    const at = (id: string) => this.objects[world.objects.findIndex((o) => o.id === id)]
    const [boat, mich, orb] = [at('boat1'), at('mich'), at('orb1')]
    if (!boat || !mich || !orb) return
    this.arriving = true
    const cam = this.cameras.main
    cam.stopFollow() // he is flying through the air: the camera holds the shore instead
    cam.centerOn(this.player.x + 8, this.player.y - 8)
    crashIn(this, { boat, mich, orb, player: this.player }, () => {
      this.arriving = false
      cam.startFollow(this.player, true, 1, 1, -8, 8)
      dispatch({ type: 'talk', key: 'landing' })
    })
  }

  // the npc a burst close-up is of: the one drawn off the sheet it plays
  private closeupOf() {
    const c = world.closeup
    if (!c || c.burst === undefined) return undefined
    return world.objects.find((o) => o.kind === 'npc' && o.sprite === c.sheet)
  }

  // everything moving on the grid: the player, npcs, and a boat under sail. this.objects[i] lines
  // up with world.objects[i], sync maps them in order
  private drawActors() {
    const rides = world.objects.find((o) => o.id === world.player.ride) // he can ride too
    this.draw(this.player, world.player, 'player', rides)
    // once the zoom is in, the UI scene's big sheet stands in for him, on the same spot
    const c = world.closeup
    const star =
      c && c.down === undefined && world.time - c.since >= 1000 ? this.closeupOf() : undefined
    world.objects.forEach((o, i) => {
      const sprite = this.objects[i]
      if (!sprite) return
      if (o.kind === 'npc') {
        const on = world.objects.find((r) => r.id === o.ride) // a rider shares its tile
        this.draw(sprite, o, o.sprite, on).setVisible(o !== star)
      }
      // a boat under sail, a carpet in the air or a cannon being shoved moves like an actor, but
      // its frame is its own state, set by sync()
      else if (o.step) {
        const y = (o.y + (o.step.y - o.y) * o.step.t) * 16 + 16
        sprite.setPosition((o.x + (o.step.x - o.x) * o.step.t) * 16, y).setDepth(y)
      }
      inTheAir(sprite, o) // out of a wrecked boat, off a carpet, or the carpet itself coming down
    })
    const rug = world.objects.findIndex((o) => o.kind === 'flyingcarpet')
    shade(this.shadow, world.objects[rug], this.objects[rug])
  }

  // position and frame are pure functions of the world, so there are no tweens and no animations
  private draw(sprite: Phaser.GameObjects.Sprite, a: Actor, who = '', on?: Obj) {
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
    const [swing, up] = deck(on, who) // riding: he goes with it, and stands on top of it
    return sprite
      .setPosition(x + (on ? KINDS[on.kind].w * 8 - 8 : 0) + swing, y + 16 - up) // centred on it
      .setDepth(y + 16 + (on ? (on.kind === 'boat' ? -1 : 1) : 0)) // a boat's hull draws over him
      .setFrame(ROW[facing] * 3 + col)
  }

  private sync() {
    syncGround(this.layers)
    for (const sprite of this.objects) sprite.destroy()
    for (const { sprite } of this.smoke) sprite.destroy()
    for (const { white } of this.blooms) white.destroy() // the base is in this.objects, destroyed above
    for (const { smoke } of this.trees) smoke?.destroy() // ditto the tree itself
    for (const { text } of this.pops) text.destroy()
    this.pops = world.pops.map((p) => {
      const baseY = p.y * 16
      const text = this.add
        .bitmapText(p.x * 16 + 8, baseY, 'nihonium', p.text)
        .setOrigin(0.5, 1)
        // the ground is all pale pastels (crust, sand, water, grass), so a light colour vanishes on
        // it: a deep pink reads on every tile, and the dark shadow carries it over rock and soil
        .setTint(0xd63a6a)
        .setDropShadow(1, 1, 0x1a1c2c, 1)
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
          // a floor, and a ball sunk in the dirt, lie flat: he walks over them rather than behind
          .setDepth(o.kind === 'floor' || o.kind === 'embedded' ? feet - 1 : feet)
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
