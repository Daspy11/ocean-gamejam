import { expect, test } from '@playwright/test'

// Where each 5x5 corner block starts in MAPS.gallery. The dual cell at (x+1, y+1) is template cell
// (0, 0), so a correct sheet makes the block redraw frames 0..15 in reading order.
const BLOCKS = [
  { layer: 'salt', x: 1, y: 1 },
  { layer: 'sand', x: 7, y: 1 },
  { layer: 'grass', x: 13, y: 1 },
]

test('?map=gallery draws every terrain template and every object with the game code', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/?map=gallery')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({
    x: 8,
    y: 20,
    facing: 'down',
  })

  const drawn = await page.evaluate((blocks) => {
    const list = window.island.game.scene.getScene('island').children.list
    const layers = list as Phaser.Tilemaps.TilemapLayer[]
    return {
      templates: blocks.map(({ layer, x, y }) => {
        const found = layers.find((o) => o.layer?.name === layer)!
        // reading order across the 4x4 template: frame f sits at cell (f % 4, f / 4)
        return Array.from(
          { length: 16 },
          (_, f) => found.getTileAt(x + 1 + (f % 4), y + 1 + Math.floor(f / 4)).index,
        )
      }),
      sprites: [
        ...new Set(
          (list as Phaser.GameObjects.Sprite[])
            .map((o) => o.texture?.key)
            .filter((key) => key?.startsWith('sprites/')),
        ),
      ].sort(),
    }
  }, BLOCKS)

  const template = Array.from({ length: 16 }, (_, f) => f)
  for (const block of drawn.templates) expect(block).toEqual(template)
  expect(drawn.sprites).toEqual([
    'sprites/boat',
    'sprites/crate',
    'sprites/hut',
    'sprites/mich',
    'sprites/orb',
    'sprites/player',
    'sprites/tree',
  ])

  // zoom out to fit the whole proof sheet in the shot; the shipped camera stays at 2x
  await page.evaluate(() => {
    const cam = window.island.game.scene.getScene('island').cameras.main
    cam.stopFollow()
    cam.setZoom(1)
    cam.setScroll(0, 0)
  })
  await page.waitForTimeout(200)
  await page.locator('#game canvas').screenshot({ path: 'test-results/gallery.png' })

  // freeze the player a tenth of the way into a step to the left, so the walk frame holds still
  const frames = await page.evaluate(async () => {
    const w = window.island.world()
    w.player = {
      x: 8,
      y: 20,
      facing: 'left',
      step: { x: 7, y: 20, t: 0.1 },
      held: null,
      run: false,
      turnedAt: 0,
      parity: false,
    }
    window.island.load(w)
    const scene = window.island.game.scene.getScene('island')
    scene.cameras.main.setZoom(6).centerOn(7 * 16 + 8, 20 * 16 + 8)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    window.island.game.loop.sleep() // hold the drawn frame while the screenshot is taken
    const at = (key: string) =>
      (scene.children.list as Phaser.GameObjects.Sprite[]).find((o) => o.texture?.key === key)
        ?.frame.name
    return { player: at('sprites/player'), mich: at('sprites/mich') }
  })
  // RPG Maker layout: left is row 1, so mid-step is 1 * 3 + 2 and a standing npc facing down is 1
  expect(frames).toEqual({ player: 5, mich: 1 })
  await page.locator('#game canvas').screenshot({ path: 'test-results/walk.png' })

  expect(errors).toEqual([])
})
