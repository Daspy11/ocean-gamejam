import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Debug from './scenes/Debug'
import Intro from './scenes/Intro'
import Island from './scenes/Island'
import Outro from './scenes/Outro'
import UI from './scenes/UI'
import Settings from './scenes/Settings'
import { speak, VOICES } from './scenes/speech'
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
  scene: [Boot, Intro, Island, new Island('cave'), UI, Debug, Outro, Settings],
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
  voices: VOICES,
  voice: (who) => speak(game.scene.getScene('ui'), who, 'abc', 0, 3),
}

// Three P presses keep the development menu out of the game's confirm/cancel bindings.
if (import.meta.env.DEV) {
  let presses = 0
  let lastPress = 0
  addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (e.code !== 'KeyP' || game.scene.isActive('settings')) {
      presses = 0
      return
    }
    presses = e.timeStamp - lastPress > 1000 ? 1 : presses + 1
    lastPress = e.timeStamp
    if (presses < 3) return
    presses = 0
    e.preventDefault()
    if (game.scene.isActive('debug')) {
      game.scene.stop('debug')
      return
    }
    game.scene.start('debug')
  })
}
