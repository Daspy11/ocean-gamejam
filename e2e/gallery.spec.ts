import { expect, test } from '@playwright/test'

// Where each terrain's block starts in MAPS.gallery: a 2x2 at (x, y) draws the sheet's 3x3 island
// from dual cell (x, y), the ring beside it draws the 2x2 hole from (x+4, y+1), and the checkerboard
// under them draws the diagonals at (x+1, y+5). A correct sheet redraws frames 0..14 in reading order.
const BLOCKS = [
  { layer: 'salt', x: 1, y: 1 },
  { layer: 'sand', x: 8, y: 1 },
  { layer: 'grass', x: 15, y: 1 },
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
        // reading order across the 5x3 sheet: the island fills cols 0..2, the hole and diagonals col 3..4
        return Array.from({ length: 15 }, (_, f) => {
          const row = Math.floor(f / 5)
          const col = f % 5
          const cell =
            col < 3
              ? [x + col, y + row]
              : row < 2
                ? [x + 1 + col, y + 1 + row]
                : [x - 2 + col, y + 5]
          return found.getTileAt(cell[0], cell[1]).index
        })
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

  const template = Array.from({ length: 15 }, (_, f) => f)
  for (const block of drawn.templates) expect(block).toEqual(template)
  expect(drawn.sprites).toEqual([
    'sprites/boat',
    'sprites/crate',
    'sprites/flower',
    'sprites/hut',
    'sprites/mich',
    'sprites/orb',
    'sprites/player',
    'sprites/smoke',
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

test('Z three times flips to the gallery map and back', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForURL(/map=gallery/)
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({ x: 8, y: 20 })

  // two presses, a pause, then one more: never three within a second, so nothing happens
  await page.keyboard.press('z')
  await page.keyboard.press('z')
  await page.waitForTimeout(1100)
  await page.keyboard.press('z')
  await page.waitForTimeout(200)
  expect(page.url()).toContain('map=gallery')

  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForURL(/scene=island/)
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({ x: 14, y: 16 })
})
