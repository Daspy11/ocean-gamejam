import Phaser from 'phaser'
import { cancelScene } from '../game/cutscene'
import type { Dir } from '../game/world'
import { load, world } from '../store'

// The secret dev menu behind the Z-Z-Z shortcut in main.ts: cheats for reaching the far corners of
// the map without walking there. Never opened in the itch build, so the labels are plain English.
const gallery = () => new URLSearchParams(location.search).get('map') === 'gallery'

// four call sites: every warp puts him down standing still, holding nothing, and drops the
// cutscene that was playing rather than leaving it to run on somewhere he can no longer see
const warp = (x: number, y: number, facing: Dir) => {
  const w = structuredClone(world)
  cancelScene(w)
  w.player = { ...w.player, x, y, facing, step: null, held: null }
  load(w)
}

export default class Debug extends Phaser.Scene {
  private options: { label: string; run: () => void }[] = []
  private lines: Phaser.GameObjects.BitmapText[] = []
  private cursor = 0
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('debug')
  }

  create() {
    this.scene.pause('island') // or an arrow key would walk the player about behind the panel
    // on shutdown rather than in close(), so main.ts stopping the scene on Z resumes it too
    this.events.once('shutdown', () => this.scene.resume('island'))
    this.cursor = 0
    this.options = [
      {
        label: gallery() ? 'back to the game' : 'gallery',
        run: () => (location.search = gallery() ? '?scene=island' : '?map=gallery'),
      },
      { label: 'to the first island', run: () => warp(14, 16, 'right') }, // where the boat wrecks
      { label: 'into the cave', run: () => warp(10, 40, 'up') },
      { label: 'to the big island', run: () => warp(33, 17, 'right') },
      { label: 'to the north island', run: () => warp(22, 3, 'down') },
      {
        label: '+10 twigs',
        run: () =>
          load({
            ...world,
            inventory: { ...world.inventory, twig: (world.inventory.twig ?? 0) + 10 },
          }),
      },
    ]

    // the panel is sized to the list and centred on the 640x360 canvas, like the inventory one
    const height = this.options.length * 16 + 24
    this.add.nineslice(200, (360 - height) / 2, 'ui/box', 0, 240, height, 8, 8, 8, 8).setOrigin(0)
    this.lines = this.options.map((o, i) =>
      this.add.bitmapText(212, (360 - height) / 2 + 12 + i * 16, 'basis33', o.label),
    )
    this.draw()

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,W,S,E,SPACE,ENTER,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
  }

  update() {
    const down = (keys: Phaser.Input.Keyboard.Key[]) =>
      keys.some((key) => Phaser.Input.Keyboard.JustDown(key))
    const by = down([this.keys.UP, this.keys.W]) ? -1 : down([this.keys.DOWN, this.keys.S]) ? 1 : 0
    if (by) {
      this.cursor = Math.max(0, Math.min(this.options.length - 1, this.cursor + by))
      this.draw()
    }
    if (down([this.keys.ESC]))
      this.close() // Z closes it too, from the one listener in main.ts
    else if (down([this.keys.E, this.keys.SPACE, this.keys.ENTER])) {
      this.options[this.cursor].run()
      this.close()
    }
  }

  private draw() {
    this.lines.forEach((line, i) =>
      line.setText(`${i === this.cursor ? '> ' : '  '}${this.options[i].label}`),
    )
  }

  private close() {
    this.scene.stop()
  }
}
