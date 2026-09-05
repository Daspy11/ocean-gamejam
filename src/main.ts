import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Debug from './scenes/Debug'
import Intro from './scenes/Intro'
import Island from './scenes/Island'
import UI from './scenes/UI'
import { content, dispatch, load, world } from './store'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 640,
  height: 360,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Intro, Island, UI, Debug],
})

// A game pixel has to be a whole number of screen pixels or the browser draws some of them two wide
// and the next three, which reads as a lumpy font. So take the biggest whole multiple of 640x360
// that fits and letterbox the rest, rather than stretching. 640x360 divides exactly into every
// screen the game will meet: 1280x720 is 2x, 1080p 3x, 1440p 4x, 4K 6x. Set the itch.io frame to
// 1280x720 and it fills the frame edge to edge with nothing left over.
const snap = () =>
  game.scale.setZoom(Math.max(1, Math.floor(Math.min(innerWidth / 640, innerHeight / 360))))
game.events.once('ready', snap)
addEventListener('resize', snap)

window.island = {
  world: () => structuredClone(world),
  dispatch,
  load,
  content: () => content,
  game,
}

// Dev shortcut: Z three times within a second opens the secret debug menu (scenes/Debug.ts), which
// is where the gallery flip lives now. Left out of the itch.io build.
let zs: number[] = []
if (import.meta.env.DEV)
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyZ' || e.repeat) return
    // one Z shuts the menu again: counting presses only makes sense while it is closed, and the
    // scene reading the key for itself would race this listener
    if (game.scene.isActive('debug')) {
      zs = []
      game.scene.stop('debug')
      return
    }
    zs = [...zs.filter((t) => e.timeStamp - t < 1000), e.timeStamp]
    if (zs.length < 3) return
    zs = [] // three fresh presses to open it again
    game.scene.start('debug')
  })
