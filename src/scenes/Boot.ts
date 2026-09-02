import Phaser from 'phaser'
import { JSONS, SHEETS, resolve } from '../assets'
import { MAPS } from '../game/map'
import { createWorld, type Dialogue } from '../game/world'
import { load, setContent } from '../store'

export default class Boot extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    for (const [key, frame] of Object.entries(SHEETS))
      this.load.spritesheet(key, resolve(`${key}.png`).url, frame)
    for (const key of JSONS) this.load.json(key, resolve(`${key}.json`).url)
  }

  create() {
    const dialogues: Record<string, Dialogue> = {}
    // the dialogue id is the basename: 'dialogue/mich' loads as 'mich'
    for (const key of JSONS)
      if (key.startsWith('dialogue/'))
        dialogues[key.slice(key.lastIndexOf('/') + 1)] = this.cache.json.get(key)
    setContent({ dialogues, items: this.cache.json.get('text/items') })

    const files = [
      ...Object.keys(SHEETS).map((key) => `${key}.png`),
      ...JSONS.map((key) => `${key}.json`),
    ]
    const stubs = files.filter((file) => resolve(file).placeholder)
    console.info(`placeholders: ${stubs.join(' ') || 'none, all assets are real'}`)

    const params = new URLSearchParams(location.search)
    const map = params.get('map')
    // ?map=<name> drops straight into gameplay on that map: ?map=gallery is the artist's proof sheet
    if (map && map in MAPS) {
      load(createWorld(map as keyof typeof MAPS))
      this.scene.start('island')
      return
    }
    // ?scene=island skips the menu and the cutscene; tests and dev use it
    this.scene.start(params.get('scene') ?? 'menu')
  }
}
