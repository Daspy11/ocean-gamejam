import Phaser from 'phaser'
import type { Dir } from '../game/world'
import { dispatch, world } from '../store'

const TILE = { water: 0, sand: 1, grass: 2 } // terrain.png frame per tile kind
const FACE = { down: 0, up: 1, left: 2, right: 3 } // player.png frame per facing

export default class Island extends Phaser.Scene {
  private rev = -1
  private layer!: Phaser.Tilemaps.TilemapLayer
  private player!: Phaser.GameObjects.Sprite
  private objects: Phaser.GameObjects.Sprite[] = []
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('island')
  }

  create() {
    const map = this.make.tilemap({
      tileWidth: 16,
      tileHeight: 16,
      width: world.width,
      height: world.height,
    })
    this.layer = map.createBlankLayer('ground', map.addTilesetImage('tiles/terrain')!)!

    this.player = this.add
      .sprite(world.player.x * 16, world.player.y * 16, 'sprites/player', 0)
      .setOrigin(0)

    this.cameras.main.setZoom(2)
    this.cameras.main.setBounds(0, 0, world.width * 16, world.height * 16)
    this.cameras.main.startFollow(this.player, true)

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E,SPACE,ENTER') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >

    this.sync()
    this.rev = world.rev
  }

  update(time: number, delta: number) {
    const moves: [Dir, Phaser.Input.Keyboard.Key[]][] = [
      ['up', [this.keys.UP, this.keys.W]],
      ['down', [this.keys.DOWN, this.keys.S]],
      ['left', [this.keys.LEFT, this.keys.A]],
      ['right', [this.keys.RIGHT, this.keys.D]],
    ]
    for (const [dir, keys] of moves) {
      // walking repeats while held (the reducer throttles); menu movement is one step per press
      const pressed = world.dialogue
        ? keys.some((key) => Phaser.Input.Keyboard.JustDown(key))
        : keys.some((key) => key.isDown)
      if (pressed) {
        dispatch({ type: 'move', dir })
        break
      }
    }

    const interact = [this.keys.E, this.keys.SPACE, this.keys.ENTER]
    if (interact.some((key) => Phaser.Input.Keyboard.JustDown(key))) dispatch({ type: 'interact' })

    dispatch({ type: 'tick', dt: delta })

    if (world.rev !== this.rev) {
      this.rev = world.rev
      this.sync()
    }
  }

  private sync() {
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++)
        this.layer.putTileAt(TILE[world.tiles[y * world.width + x]], x, y)

    this.player.setFrame(FACE[world.player.facing])
    const x = world.player.x * 16
    const y = world.player.y * 16
    if (this.player.x !== x || this.player.y !== y)
      this.tweens.add({ targets: this.player, x, y, duration: 150 })

    for (const sprite of this.objects) sprite.destroy()
    this.objects = []
    for (const pool of world.tidepools) {
      this.objects.push(
        this.add.sprite(pool.x * 16, pool.y * 16, 'sprites/objects', 0).setOrigin(0),
      )
      if (pool.stone)
        this.objects.push(
          this.add.sprite(pool.x * 16, pool.y * 16, 'sprites/objects', 1).setOrigin(0),
        )
    }
    for (const npc of world.npcs)
      this.objects.push(this.add.sprite(npc.x * 16, npc.y * 16, 'sprites/objects', 2).setOrigin(0))
  }
}
