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
