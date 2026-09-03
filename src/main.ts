import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Intro from './scenes/Intro'
import Island from './scenes/Island'
import Menu from './scenes/Menu'
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
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Menu, Intro, Island, UI],
})

window.island = {
  world: () => structuredClone(world),
  dispatch,
  load,
  content: () => content,
  game,
}

// Dev shortcut: Z three times within a second flips between the game and the ?map=gallery proof sheet.
// A page reload keeps it to one line per direction; left out of the itch.io build.
let zs: number[] = []
if (import.meta.env.DEV)
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyZ' || e.repeat) return
    zs = [...zs.filter((t) => e.timeStamp - t < 1000), e.timeStamp]
    if (zs.length < 3) return
    const gallery = new URLSearchParams(location.search).get('map') === 'gallery'
    location.search = gallery ? '?scene=island' : '?map=gallery'
  })
