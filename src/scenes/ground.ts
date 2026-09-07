import Phaser from 'phaser'
import { DUAL_FRAME } from '../assets'
import { tileAt, type Tile } from '../game/world'
import { world } from '../store'

// The terrain under everything: one tilemap layer per terrain, drawn lowest first, so each layer's
// mask counts every terrain above it as itself.
const GROUND: Tile[] = ['water', 'salt', 'sand', 'grass', 'charred', 'farm', 'rock']

export function makeGround(scene: Phaser.Scene): Phaser.Tilemaps.TilemapLayer[] {
  return GROUND.map((terrain, n) => {
    // every terrain above the base is a dual grid: (W+1)x(H+1) cells shifted half a tile up and left
    const map = scene.make.tilemap({
      tileWidth: 16,
      tileHeight: 16,
      width: world.width + (n ? 1 : 0),
      height: world.height + (n ? 1 : 0),
    })
    const layer = map.createBlankLayer(terrain, map.addTilesetImage(`tiles/${terrain}`)!)!
    if (n) layer.setPosition(-8, -8)
    else layer.fill(0, 0, 0, world.width, world.height)
    return layer
  })
}

export function syncGround(layers: Phaser.Tilemaps.TilemapLayer[]): void {
  for (let n = 1; n < GROUND.length; n++) {
    // a higher terrain counts as every terrain below it, so a rounded corner never opens onto water
    const is = (x: number, y: number, bit: number) => {
      const tile = tileAt(world, x, y) // undefined off the map: nothing there
      return tile && GROUND.indexOf(tile) >= n ? bit : 0
    }
    for (let j = 0; j <= world.height; j++)
      for (let i = 0; i <= world.width; i++)
        // the dual cell's centre sits on the corner shared by these four logical tiles; -1 (no
        // corner is this terrain or higher) clears the cell
        layers[n].putTileAt(
          DUAL_FRAME[is(i - 1, j - 1, 1) + is(i, j - 1, 2) + is(i - 1, j, 4) + is(i, j, 8)],
          i,
          j,
        )
  }
}
