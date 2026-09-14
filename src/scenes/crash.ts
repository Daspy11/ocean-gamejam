import { harryFrame } from '../game/boat'
import type Phaser from 'phaser'
import { LIFT, hopMs } from '../game/boat'
import { KINDS, type Dir, type Obj } from '../game/world'
import { settings, world } from '../store'

type Sprite = Phaser.GameObjects.Sprite

// The tail of the intro cutscene, played on the island itself: the rowboat comes in off the sea far
// too fast, slams onto the shore, and the two of them somersault out of it onto the sand. Pure show
// — the sim already has the wreck, Mich and the player standing exactly where this leaves them.
type Cast = {
  boat: Phaser.GameObjects.Sprite
  mich: Phaser.GameObjects.Sprite
  player: Phaser.GameObjects.Sprite
  orb: Phaser.GameObjects.Sprite
}
type At = { x: number; y: number }

const HIGH = 24 // px of air the carpet flies above the ground, and falls through when it lands
const WAFT = 3000 // ms it takes to come down, the same trip `land` holds the act for

// how the carpet sits over the tile it is on: how far it swings side to side, and how high off the
// ground it is. It hangs at HIGH until it starts coming down, swings itself the last of the way,
// and once walked off the ground again climbs smoothly back up over its second.
function float(o?: Obj): [number, number] {
  if (o?.kind !== 'flyingcarpet') return [0, 0]
  if (o.landAt !== undefined) {
    const p = Math.min(1, (world.time - o.landAt) / WAFT)
    return [Math.sin(p * Math.PI * 5) * 7 * (1 - p), (1 - p) * HIGH]
  }
  const p = o.liftAt === undefined ? 1 : Math.max(0, Math.min(1, (world.time - o.liftAt) / LIFT))
  return [0, p * p * (3 - 2 * p) * HIGH] // smoothstep: it leaves the ground gently and settles
}

// how far through his jump aboard he is: 1 once he is down, or if he never jumped
const hopT = (a: { x: number; y: number; hop?: Obj['thrown'] }) =>
  a.hop === undefined ? 1 : Math.min(1, (world.time - a.hop.at) / hopMs(a.hop, a))

// where whoever is riding `on` is drawn: he swings with a carpet, flies with it, and stands on the
// weave rather than behind it; on somebody's shoulders he is drawn a head up.
export function deck(on?: Obj, who = ''): [number, number] {
  if (on?.kind === 'boat' && who === 'etarp') return [0, 1]
  // up on somebody's head: he goes wherever that somebody is drawn, carpet, jump and all, and
  // sits five pixels down and a pixel over from square on top of her
  if (on?.kind === 'npc') {
    const [swing, up] = deck(
      world.objects.find((o) => o.id === on.ride),
      on.sprite,
    )
    const [dx, dy] = hopOff(on, up, swing)
    if (who === 'etarp' && on.sprite === 'seahorse') return [swing + dx, up - dy + 24]
    return [swing + dx + 1, up - dy + 15]
  }
  const [swing, up] = float(on)
  if (on?.kind !== 'flyingcarpet') return [swing, 0]
  // two of them on the one carpet stand shoulder to shoulder rather than in the same spot: the
  // first aboard lands in the middle and shuffles over as the second comes down beside her
  const crew: { x: number; y: number; hop?: Obj['thrown']; who: string }[] = world.objects.flatMap(
    (o) => (o.kind === 'npc' && o.ride === on.id ? [{ ...o, who: o.sprite }] : []),
  )
  if (world.player.ride === on.id) crew.push({ ...world.player, who: 'player' })
  const n = crew.findIndex((c) => c.who === who)
  const settle = Math.min(...crew.map(hopT)) // 0..1 through the newest jump aboard
  return [swing + (crew.length > 1 && n >= 0 ? (n * 18 - 9) * settle : 0), up + 10]
}

// getting aboard: he is riding from the off, so he is thrown along a plain parabola from the tile
// he jumped off, on the ground, to his place `rise` above the one he lands on, the way anything
// jumping goes up and comes down. This is how far that has him from where he is drawn standing,
// and the bounce on its own, so the camera can follow the jump without it.
export function hopOff(
  a: { x: number; y: number; hop?: Obj['thrown'] },
  rise = 0,
  shift = 0,
): [number, number, number] {
  const t = hopT(a)
  if (a.hop === undefined || t >= 1) return [0, 0, 0]
  const far = Math.abs(a.x - a.hop.x) + Math.abs(a.y - a.hop.y)
  const up = 4 * (8 + 4 * far) * t * (1 - t) // a jump next door clears a little, a leap clears more
  return [
    ((a.hop.x - a.x) * 16 - shift) * (1 - t),
    ((a.hop.y - a.y) * 16 + rise) * (1 - t) - up,
    up,
  ]
}

export function spring(
  a: { x: number; y: number; hop?: Obj['thrown'] },
  x: number,
  y: number,
  rise: number,
  shift = 0,
): [number, number] {
  const [dx, dy] = hopOff(a, rise, shift)
  return [x + dx, y + dy]
}

// the disc of shade on the ground under the carpet, marking the tile it is really on. It shrinks as
// the carpet comes down to meet it, and once the carpet is on the ground there is no shadow at all.
export function shade(shadow: Sprite, o?: Obj, sprite?: Sprite): void {
  const up = float(o)[1]
  shadow.setVisible(!!o && !!sprite && up > 0)
  if (!o || !sprite) return
  shadow.setPosition(sprite.x + 8, o.y * 16 + 8).setScale(0.2 + (0.8 * up) / HIGH)
  shadow.setDepth(o.y * 16 + 15) // on the ground, under everything standing on that row
}

export function crashIn(scene: Phaser.Scene, cast: Cast, done: () => void): void {
  const { boat } = cast
  const [x, y, depth] = [boat.x, boat.y, boat.depth]
  // the pair ride the hull the whole way in: her in the bow, him on the oars 14 px behind, both
  // 3 px above the waterline and under the boat, so its near gunwale cuts across their legs
  // the orb is stowed between them and is thrown clear first, so it is on the sand as they land
  const crew: { who: Phaser.GameObjects.Sprite; dx: number; rest: At }[] = [
    { who: cast.orb, dx: 8, rest: { x: cast.orb.x, y: cast.orb.y } },
    { who: cast.mich, dx: 0, rest: { x: cast.mich.x, y: cast.mich.y } },
    { who: cast.player, dx: 14, rest: { x: cast.player.x, y: cast.player.y } },
  ]
  const seat = () =>
    crew.forEach((c) => c.who.setPosition(boat.x + c.dx, boat.y - 3).setDepth(8999))
  boat.setPosition(x - 176, y).setDepth(9000) // 11 tiles out west, off the left of the camera
  seat()
  scene.tweens.add({
    targets: boat,
    x,
    duration: 900,
    ease: 'Quad.easeIn', // it comes in flat and fast, straight along the shore, and only speeds up
    onUpdate: seat,
    onComplete: () => {
      boat.setDepth(depth)
      if (settings.sfx) scene.sound.play('sfx/crash')
      scene.cameras.main.shake(300, 0.015)
      // a beat between each of them, so they read as three throws rather than one lump
      crew.forEach((c, n) =>
        flip(
          scene,
          c.who,
          { x: boat.x + c.dx, y: boat.y - 3 },
          c.rest,
          n * 120,
          n === crew.length - 1 ? done : undefined,
        ),
      )
    },
  })
}

// one somersault out of the hull: a 600 ms arc from the seat to the tile he lands on, turning a
// full turn on the way over. The sprite is bottom-left anchored, so it spins about its middle
// (8 px in, 12 px up) and is put back on its feet at the end.
function flip(
  scene: Phaser.Scene,
  who: Phaser.GameObjects.Sprite,
  from: At,
  to: At,
  delay: number,
  done?: () => void,
) {
  const at = { t: 0 }
  who
    .setOrigin(0.5, 0.5)
    .setPosition(from.x + 8, from.y - 12)
    .setDepth(9000)
  scene.tweens.add({
    targets: at,
    t: 1,
    duration: 600,
    delay,
    onUpdate: () => {
      who.setPosition(
        from.x + 8 + (to.x - from.x) * at.t,
        from.y - 12 + (to.y - from.y) * at.t - Math.sin(at.t * Math.PI) * 28, // 28 px over the top
      )
      who.rotation = at.t * Math.PI * 2
    },
    onComplete: () => {
      who.setOrigin(0, 1).setPosition(to.x, to.y).setDepth(to.y)
      who.rotation = 0
      done?.()
    },
  })
}

// Everything the ground has not got hold of yet. Etarp's impact step is a somersault over the bow,
// so he lands like the two in the intro. Tarq, knocked off his carpet, lies where he fell,
// and the carpet itself comes down out of the sky over its 3 s.
export function inTheAir(sprite: Phaser.GameObjects.Sprite, o: Obj): void {
  if (o.kind === 'harry') sprite.setFrame(harryFrame(world, o))
  if (o.kind !== 'npc' && o.thrown !== undefined) {
    const t = Math.min(1, (world.time - o.thrown.at) / 300)
    sprite.setPosition(
      (o.thrown.x + (o.x - o.thrown.x) * t) * 16,
      (o.thrown.y + (o.y - o.thrown.y) * t + 1) * 16 - 4 * t * (1 - t) * 12,
    )
    return
  }
  if (o.kind === 'flyingcarpet') {
    // two tiles of art, centred on the one tile it flies over, and drawn its height above it
    const [swing, up] = float(o)
    const at = (n: number, to: number) => (o.step ? n + (to - n) * o.step.t : n) * 16
    // On the ground it lies under every actor, including those approaching from the far side.
    sprite.setOrigin(0.25, 0.75).setDepth(up > 0 ? 9000 : 1)
    sprite
      .setPosition(at(o.x, o.step?.x ?? o.x) + swing, at(o.y, o.step?.y ?? o.y) + 16 - up)
      .setFrame(o.step ? 1 : 0) // the flutter while it is actually flying a step, still otherwise
    return
  }
  if (o.kind === 'npc' && o.flat) {
    // knocked off what he was riding: one somersault over to where he lands, and face down there
    const t = o.thrown ? Math.min(1, (world.time - o.thrown.at) / 600) : 1
    const from = o.thrown ?? o
    sprite
      .setOrigin(0.5, 0.5)
      .setRotation(t * Math.PI * 2.5)
      .setDepth(t < 1 ? 9001 : (o.y + 1) * 16)
    sprite.setPosition(
      (from.x + (o.x - from.x) * t) * 16 + 8,
      (from.y + (o.y - from.y) * t) * 16 + 8 - Math.sin(t * Math.PI) * 20 - (1 - t) * (HIGH + 14),
    )
    return
  }
  if (o.kind !== 'npc' || !o.thrown || !o.step) {
    if (sprite.originY !== 1) sprite.setOrigin(0, 1).setRotation(0) // back on his feet
    return
  }
  const t = o.step.t
  sprite
    .setOrigin(0.5, 0.5)
    .setDepth(9000)
    .setRotation(t * Math.PI * 2)
  sprite.setPosition(
    (o.thrown.x + (o.step.x - o.thrown.x) * t) * 16 + 8,
    (o.thrown.y + (o.step.y - o.thrown.y) * t) * 16 + 4 - Math.sin(t * Math.PI) * 28,
  )
}

export function drawThrow(sprite: Sprite): void {
  const t = world.throwing
  const f = t?.flight
  sprite.setVisible(!!f && world.time < f.until)
  if (!t || !f) return
  const elapsed = (world.time - f.at) / 1000
  sprite.setTexture(`sprites/${t.kind}`, 0)
  sprite
    .setOrigin(0.5)
    .setDepth(9100)
    .setPosition((f.x + f.vx * elapsed) * 16, (f.y + f.vy * elapsed) * 16)
    .setRotation(elapsed * 12)
}

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const
const ROW = { down: 0, left: 1, right: 2, up: 3 }
type Actor = Pick<Obj & { kind: 'npc' }, 'x' | 'y' | 'facing' | 'step' | 'parity' | 'hop'>
// position and frame are pure functions of the world, so there are no tweens and no animations
export function drawActor(sprite: Phaser.GameObjects.Sprite, a: Actor, who = '', on?: Obj) {
  const x = (a.step ? a.x + (a.step.x - a.x) * a.step.t : a.x) * 16
  const y = (a.step ? a.y + (a.step.y - a.y) * a.step.t : a.y) * 16
  const walking = a.step && !on // a rider shares his deck's step, but stands still on it
  const col = walking ? (a.step!.t < 0.5 ? (a.parity ? 0 : 2) : a.parity ? 1 : 3) : 1
  // the crab scuttles sideways, then faces his conversation partner when he stops;
  // the pirate is blind, so he is always drawn looking the opposite way to the one he faces
  const crab: Dir = !walking ? a.facing : a.facing === 'left' ? 'left' : 'right'
  const facing = who === 'walter' ? crab : who === 'etarp' ? OPP[a.facing] : a.facing
  const [swing, up] = deck(on, who) // riding: he goes with it, and stands on top of it
  const shift = (on ? KINDS[on.kind].w * 8 - 8 : 0) + swing
  const flying =
    on?.kind === 'flyingcarpet' ||
    (on?.kind === 'npc' && world.objects.some((o) => o.id === on.ride && o.kind === 'flyingcarpet'))
  // centred on what he rides, and arcing over from where he sprang if he is still on his way up
  return sprite
    .setPosition(...spring(a, x + shift, y + 16 - up, up, shift))
    .setDepth(
      (flying ? 9000 : y + 16) + (on ? (on.kind === 'boat' ? -1 : on.kind === 'npc' ? 2 : 1) : 0),
    )
    .setFrame(ROW[facing] * 4 + col)
}
