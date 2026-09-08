import Phaser from 'phaser'
import { blast } from '../game/machine'
import { createWorld, npc, type World } from '../game/world'
import { dispatch, load, world } from '../store'

// The secret dev menu behind the Z-Z-Z shortcut in main.ts: it jumps the game to a story beat, so
// you can play any of them without walking the whole way there again. Every jump builds a fresh
// world and fast-forwards it, which drops whatever cutscene was running with the world it ran in.
// Never opened in the itch build, so the labels are plain English.
const gallery = () => new URLSearchParams(location.search).get('map') === 'gallery'

// orb1 picked up off the sand and in the bag, under the name both inventory beats leave it with
const orb = (w: World) => {
  const at = w.objects.findIndex((o) => o.id === 'orb1')
  if (at >= 0) w.objects.splice(at, 1)
  w.inventory.orb = 1
  Object.assign(w.flags, {
    'had:orb': true,
    'fired:got': true,
    'fired:crate': true,
    'fired:inventory1': true,
    'fired:inventory2': true,
    'name:orb': 'fire orb', // what inventory2.json settles on
  })
}

// the end of flower.json: the flower has bloomed for its 10, Walter has walked down to the tree and
// handed the carpet over, and beauty is on the HUD from here on
const beautyOn = (w: World) => {
  orb(w)
  const crate = w.objects.find((o) => o.id === 'crate2')
  if (crate?.kind === 'crate') crate.open = true
  w.objects.push({ id: 'flower1', kind: 'flower', x: 18, y: 14, white: true })
  w.objects.push(npc('walter', 'walter', 17, 16, 'left', 'walter'))
  w.inventory.carpet = 1
  w.score = 10
  Object.assign(w.flags, {
    'had:electrolytes': true,
    'ate:electrolytes': true,
    'had:carpet': true,
    'fired:flower': true,
    'score:on': true,
    'walter:under': true,
  })
  w.player = { ...w.player, x: 16, y: 17, facing: 'up' }
}

// the end of pirate.json: a salt bridge up the 20 column, the ship aground on it, and Etarp behind
// the bar he built on the north island, waiting on rum
const north = (w: World) => {
  for (let y = 6; y <= 13; y++) w.tiles[y * w.width + 20] = 'salt' // 20,13 is the tile that lands it
  w.objects.push({ id: 'ship', kind: 'boat', x: 21, y: 8, wrecked: true, dialogue: 'ship' })
  w.objects.push(npc('etarp', 'etarp', 22, 2, 'down', 'etarp'))
  w.objects.push({ id: 'bar1', kind: 'bar', x: 23, y: 2 }, { id: 'bar2', kind: 'bar', x: 23, y: 3 })
  w.objects.push({ id: 'bar3', kind: 'bar', x: 22, y: 3 }, { id: 'bar4', kind: 'bar', x: 21, y: 3 })
  Object.assign(w.flags, { 'fired:pirate': true, 'etarp:bar': true })
}

// the rum is in the bag so his cocktail can be tried
const yarrtender = (w: World) => {
  orb(w)
  north(w)
  w.inventory.rum = 1
  w.flags['had:rum'] = true
  w.player = { ...w.player, x: 22, y: 4, facing: 'up' } // across the counter from him
}

// antoine's carrots handed over and his chair asked for, with a cocktail for harry in the bag, stood north
// of harry and his deck chairs on the big island's south shore
const cocktail = (w: World) => {
  beautyOn(w)
  w.objects = w.objects.filter((o) => o.kind !== 'carrot')
  w.inventory.otijom = 1
  Object.assign(w.flags, {
    'shrimp:asked': true,
    'shrimp:chair': true,
    'had:carrot': true,
    'had:otijom': true,
  })
  w.player = { ...w.player, x: 40, y: 25, facing: 'down' }
}

// everything the bag ever puts down, stood on the island: the carpet, the golden egg and the
// certificate are what add up to fifteen beauty, so by then all three are down. One of Harry's deck
// chairs has gone to the shrimp for that certificate, and he is sat on it.
const placed = (w: World) => {
  w.objects.push({ id: 'floor15-14', kind: 'floor', x: 15, y: 14 })
  w.objects.push({ id: 'egg15-17', kind: 'egg', x: 15, y: 17 })
  w.objects.push({ id: 'certificate17-17', kind: 'certificate', x: 17, y: 17 })
  w.objects = w.objects.filter((o) => o.kind !== 'carrot' && o.id !== 'chair1')
  delete w.inventory.carpet
  Object.assign(w.flags, {
    'placed:carpet': true,
    'placed:egg': true,
    'placed:certificate': true,
    'had:twig': true,
    'had:egg': true,
    'had:carrot': true,
    'had:otijom': true,
    'had:certificate': true,
    'shrimp:asked': true,
    'shrimp:chair': true,
    'sprite:shrimp': 'shrimpchair',
    'harry:ok': true,
  })
}

// the world the sea horse's scene leaves behind: Etarp at his bar with the bridge home, the sea
// horse ashore at the island's north tip, and the crust his prototype left
const afterSeahorse = (w: World) => {
  beautyOn(w)
  yarrtender(w)
  placed(w)
  w.objects.push(npc('seahorse', 'seahorse', 13, 15, 'right', 'seahorse'))
  blast(w, 13, 14)
  w.score = 15
  Object.assign(w.flags, { 'seahorse:met': true, 'fired:seahorse': true })
  w.player = { ...w.player, x: 16, y: 15, facing: 'left' } // in the line of fire, so Walter waves him out
}

// the beats, in the order the story reaches them. `at` is the world by the time that one plays.
const STATES: { label: string; at?: (w: World) => void; talk?: string }[] = [
  { label: 'the beginning' }, // a fresh world is exactly where the intro leaves him
  { label: 'the orb', at: orb },
  { label: 'beauty is on', at: beautyOn },
  {
    label: 'ten twigs for the albatross',
    at: (w) => {
      beautyOn(w)
      w.inventory.twig = 10
      w.flags['had:twig'] = true
      w.player = { ...w.player, x: 36, y: 21, facing: 'up' } // under his nest on the big island
    },
  },
  {
    // the moment before pirate.json: the bridge is up the 20 column and he has just stepped ashore
    // on the north island, which is what fires it. `fired:pirate` so walking about cannot fire it
    // again behind the scene the jump opens.
    label: "etarp's arrival",
    at: (w) => {
      beautyOn(w)
      for (let y = 6; y <= 13; y++) w.tiles[y * w.width + 20] = 'salt'
      w.flags['fired:pirate'] = true
      w.player = { ...w.player, x: 20, y: 5, facing: 'up' }
    },
    talk: 'pirate',
  },
  {
    label: 'fifteen beauty',
    at: (w) => {
      beautyOn(w)
      yarrtender(w) // Etarp, his bar and his bridge home are all there by now, with rum in the bag
      placed(w) // and the carpet, the egg and the certificate are down, which is what got it to 15
      w.score = 15 // the next tick brings the sea horse in from the west, under the chest
      w.player = { ...w.player, x: 16, y: 17, facing: 'left' }
    },
  },
  // straight into the scene the sea horse leaves behind: talk opens it once the world is loaded
  { label: "etarp's cannon", at: afterSeahorse, talk: 'cannon' },
  {
    // and the one the cannon leaves: Etarp with it on the island's west side, Walter two tiles
    // south of his tree, and Mich where the flower scene put her
    label: 'tarq flies in',
    at: (w) => {
      afterSeahorse(w)
      const move = (id: string, x: number, y: number) => {
        const o = w.objects.find((x) => x.id === id)
        if (o) Object.assign(o, { x, y })
      }
      move('etarp', 19, 15)
      move('walter', 17, 18)
      move('mich', 18, 15)
      w.objects.push({ id: 'cannon', kind: 'cannon', x: 18, y: 15 })
      w.flags['fired:cannon'] = true
    },
    talk: 'tarq',
  },
  {
    // the flight out: the UI scene sees the flag and hands over to the Outro, Walter aboard
    label: 'leaving the island',
    at: (w) => {
      afterSeahorse(w)
      Object.assign(w.flags, { 'fired:tarq': true, 'walter:aboard': true, outro: true })
    },
  },
  { label: 'rum for the yarrtender', at: yarrtender },
  { label: 'a cocktail for harry', at: cocktail },
]

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
      ...STATES.map(({ label, at, talk }) => ({
        label,
        run: () => {
          const w = createWorld()
          at?.(w)
          load(w)
          if (talk) dispatch({ type: 'talk', key: talk }) // a beat that opens straight into a scene
        },
      })),
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
