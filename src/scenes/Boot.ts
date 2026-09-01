import Phaser from 'phaser'
import { JSONS, SHEETS, resolve } from '../assets'
import type { Dialogue } from '../game/world'
import { setContent } from '../store'

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
    // the dialogue id is the basename: 'dialogue/npc1' loads as 'npc1'
    for (const key of JSONS)
      dialogues[key.slice(key.lastIndexOf('/') + 1)] = this.cache.json.get(key)
    setContent({ dialogues })

    const files = [
      ...Object.keys(SHEETS).map((key) => `${key}.png`),
      ...JSONS.map((key) => `${key}.json`),
    ]
    const stubs = files.filter((file) => resolve(file).placeholder)
    console.info(`placeholders: ${stubs.join(' ') || 'none, all assets are real'}`)

    this.scene.start('island')
    this.scene.launch('ui')
  }
}
