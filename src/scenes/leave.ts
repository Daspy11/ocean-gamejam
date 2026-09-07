import Phaser from 'phaser'
import { world } from '../store'

// The last thing the island scene does: the carpet gathers speed east, off the map and out over
// open water, with the camera holding it in frame the whole way. The Outro scene picks the same
// shot up from there, so the ending never cuts. Pure show — the sim is done with by now.
const DIST = 34 * 16 // far enough east that the island is off the back of the frame by the end
const OUT = 3200 // ms from the standstill the last act leaves them at up to the Outro's cruise

// hands over to the Outro scene when the flight is done, and takes the UI's box and HUD down with
// the island. Always returns true: the island scene is out of the picture from here on.
export function flyOut(
  scene: Phaser.Scene,
  sprites: Phaser.GameObjects.Sprite[], // one per world.objects entry, in the same order
  player: Phaser.GameObjects.Sprite,
  shadow: Phaser.GameObjects.Sprite, // the carpet's shade: there is nothing out there to fall on
): boolean {
  shadow.setVisible(false)
  const done = () => {
    scene.scene.stop('ui')
    scene.scene.start('outro')
  }
  const carpet = world.objects.findIndex((o) => o.kind === 'flyingcarpet')
  if (carpet < 0) {
    done() // a debug jump straight to the ending: there is nothing to fly out
    return true
  }
  // the carpet, whoever rides it, and whoever rides them (Walter, up on Mich's head)
  const riders = (on: string) =>
    world.objects.flatMap((o, i) => (o.kind === 'npc' && o.ride === on ? [i] : []))
  const crew = [
    sprites[carpet],
    ...riders(world.objects[carpet].id).flatMap((i) => [
      sprites[i],
      ...riders(world.objects[i].id).map((j) => sprites[j]),
    ]),
  ]
  if (world.player.ride === world.objects[carpet].id) crew.push(player)

  const cam = scene.cameras.main
  cam.stopFollow()
  cam.removeBounds() // they are leaving the map, and the shot has to follow them past its edge
  // the tilemap stops at the east shore, so lay sea under everything for them to fly out over
  scene.add
    .tileSprite(world.width * 16, 0, DIST + 640, world.height * 16, 'tiles/water')
    .setOrigin(0)
    .setDepth(-1000)

  const from = crew.map((s) => ({ s, x: s.x, y: s.y }))
  const scroll = cam.scrollX
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: OUT,
    ease: 'Sine.easeIn', // they pull away rather than snapping into motion
    onUpdate: (t) => {
      const p = t.getValue() ?? 0
      const swell = Math.sin(p * Math.PI * 4) * 2 // the carpet rides the air; a flat slide reads dead
      from.forEach(({ s, x, y }) => s.setPosition(x + DIST * p, y + swell))
      cam.setScroll(scroll + DIST * p, cam.scrollY)
    },
    onComplete: done,
  })
  return true
}
