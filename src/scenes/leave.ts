import type Phaser from 'phaser'
import { world } from '../store'

// The ending, played out in the island scene so there is never a cut: the carpet, already up at
// its height from the last act, gathers pace east, the camera holds it and eases in over open water,
// the two of them ride, and the Outro scene comes up over the top for the names. The sim keeps
// running under all of it — the shelling behind them plays itself out — so this runs after the
// scene has drawn the crew where the sim has them and moves them on from there.
const OUT = 3200 // ms of gathering speed away from the island
const RUN = 128 // px/s the last act was already flying them east at: 8 tiles a second, running
const CRUISE = 540 // screen px/s the sea runs by at, held through the zoom so the pan never slows
const IN = 1800 // ms the shot takes to ease in from the island's 2x to 3x
const RIDE = 4000 // ms of quiet flying, once the shot is in, before he plucks up the courage
const [SIDE, LOOK] = [7, 4] // his standing frames: facing the way they are going, and facing her

export function flyOut(
  scene: Phaser.Scene,
  sprites: () => Phaser.GameObjects.Sprite[], // one per world.objects entry; the scene rebuilds them
  player: Phaser.GameObjects.Sprite,
  shadow: Phaser.GameObjects.Sprite, // the carpet's shade, which runs east under them
): boolean {
  const rug = world.objects.find((o) => o.kind === 'flyingcarpet')
  if (!rug) {
    scene.scene.launch('outro') // a debug jump straight to the names: there is nothing to fly
    return true
  }
  // the two of them lean a couple of pixels in as they pluck up the courage, and whoever is up on
  // Mich's head leans with her
  const [her, him] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]
  // who is aboard, by id: the sim keeps spawning and dropping cannonballs, so the scene's sprites
  // are rebuilt under us and every frame has to look them up again
  const riders = (on: string) =>
    world.objects.flatMap((o) => (o.kind === 'npc' && o.ride === on ? [o.id] : []))
  const seats: [string, typeof her | undefined][] = [[rug.id, undefined]]
  for (const id of riders(rug.id)) {
    seats.push([id, her])
    for (const up of riders(id)) seats.push([up, her])
  }
  const me = world.player.ride === rug.id
  const crew = () => {
    const all = sprites()
    const out = seats.map(([id, seat]) => ({
      s: all[world.objects.findIndex((o) => o.id === id)],
      seat,
    }))
    if (me) out.push({ s: player, seat: him })
    return out.filter(({ s }) => s)
  }

  const cam = scene.cameras.main
  const deck = crew()[0].s
  const cameraOffset = { x: cam.midPoint.x - deck.x - 8, y: cam.midPoint.y - deck.y + 6 }
  cam.stopFollow()
  cam.removeBounds() // they are leaving the map, and the shot has to follow them past its edge
  cam.roundPixels = false // the zoom lands between whole pixels, and snapping it reads as a judder
  // the tilemap stops at the east shore, so lay sea under everything for them to fly out over
  scene.add
    .tileSprite(world.width * 16, 0, 7000, world.height * 16, 'tiles/water')
    .setOrigin(0)
    .setDepth(-1000)

  const hearts: { s: Phaser.GameObjects.Image; x: number; y: number; a: number }[] = []
  const hop = (who: { x: number; y: number }, by: number) => {
    scene.tweens.add({ targets: who, x: who.x + by, duration: 340, ease: 'Sine.easeOut' })
    scene.tweens.add({ targets: who, y: -3, duration: 170, ease: 'Sine.easeOut', yoyo: true })
  }
  // one goes up from over whoever let it out, small: the sprite's 15 px of ink drawn 7 px across
  const heart = (who: Phaser.GameObjects.Sprite, deck: Phaser.GameObjects.Sprite) => {
    const s = scene.add
      .image(0, 0, 'sprites/heart')
      .setScale(7 / 15)
      .setDepth(9100)
    const h = { s, x: who.x - deck.x, y: who.y - deck.y - 16, a: 1 } // just over his head
    hearts.push(h)
    scene.tweens.add({ targets: h, y: h.y - 24, duration: 2600, ease: 'Sine.easeOut' })
    scene.tweens.add({
      targets: h,
      x: h.x - 4,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })
    scene.tweens.add({ targets: h, a: 0, duration: 1100, delay: 1400 })
  }
  // he rides for a while, turns to look at her, leans in, and they trade a heart before he faces
  // front again; then three more seconds of the flight before the spotlight closes over the top
  let face = SIDE
  const beats: [number, (aboard: { s: Phaser.GameObjects.Sprite }[]) => void][] = [
    [RIDE, () => (face = LOOK)],
    [RIDE + 2000, () => hop(him, -2)],
    [RIDE + 2400, (aboard) => heart(player, aboard[0].s)],
    [RIDE + 5400, () => hop(her, 2)],
    [RIDE + 5800, (aboard) => heart(aboard[1].s, aboard[0].s)],
    [RIDE + 7800, () => (face = SIDE)],
    [RIDE + 10800, () => scene.scene.launch('outro')], // the names, over the flight
  ]

  let [t, x, done] = [0, 0, 0]
  const tick = (_now: number, delta: number) => {
    t += delta
    const p = Math.min(1, t / OUT)
    const q = Math.min(1, Math.max(0, (t - OUT) / IN))
    const zoom = 2 + q * q * (3 - 2 * q) // smoothstep: no kick into the zoom, and none out of it
    // they are already flying east when this takes over, so it picks their speed up where the last
    // act left it and eases up to the cruise, which is whatever holds the sea to one pace on screen
    const cruise = CRUISE / zoom
    x += ((RUN + (cruise - RUN) * Math.sin((p * Math.PI) / 2)) * delta) / 1000
    const swell = Math.sin(t / 700) * 2 * Math.max(0, 1 - Math.max(0, t - OUT) / RIDE)
    const dash = Math.min(2.4, Math.max(0, (t - OUT - RIDE - 8400) / 1000))
    const away = 60 * dash * dash // build speed gently over 2.4 s before the spotlight closes
    // the scene has just drawn them back on the island: this is where they have got to since
    const aboard = crew()
    aboard.forEach(({ s, seat }, i) =>
      s
        .setPosition(s.x + x + away + (seat?.x ?? 0), s.y + swell + (seat?.y ?? 0))
        .setDepth(9000 + i),
    )
    if (me) player.setFrame(face)
    const deck = aboard[0].s
    // the scene has drawn the shade at full size under the carpet's tile: it runs along under
    // them over the island, over the trees, and there is nothing to fall on past the shore
    shadow
      .setDepth(8999)
      .setPosition(deck.x + 8, rug.y * 16 + 8)
      .setAlpha(0.35 * Math.max(0, Math.min(1, (world.width * 16 - deck.x) / 160)))
    for (const h of hearts) h.s.setPosition(deck.x + h.x, deck.y + h.y).setAlpha(h.a)
    const settle = 1 - p * p * (3 - 2 * p)
    cam
      .setZoom(zoom)
      .centerOn(deck.x - away + 8 + cameraOffset.x * settle, deck.y - 6 + cameraOffset.y * settle)
    while (done < beats.length && t - OUT >= beats[done][0]) beats[done++][1](aboard)
  }
  scene.events.on('postupdate', tick) // after the scene has drawn the world it is leaving behind
  scene.events.once('shutdown', () => scene.events.off('postupdate', tick))
  return true
}
