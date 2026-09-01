import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: () => boolean) {
  await page.keyboard.down(key)
  await page.waitForFunction(until)
  await page.keyboard.up(key)
}

test('boots the island scene with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await expect(page.locator('#game canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('tick advances sim time', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))

  // read both sides in one evaluate so the scene's own per-frame tick can't land between them
  const advanced = await page.evaluate(() => {
    const before = window.island.world().time
    window.island.dispatch({ type: 'tick', dt: 3000 })
    return window.island.world().time - before
  })
  expect(advanced).toBe(3000)
})

test('arrow key walks the player one tile', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  const start = await page.evaluate(() => window.island.world().player.x)
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction((x) => window.island.world().player.x !== x, start)
  await page.keyboard.up('ArrowRight')

  const player = await page.evaluate(() => window.island.world().player)
  expect(player.x).toBe(start + 1)
  expect(player.facing).toBe('right')
})

test('a tidepool grows a stone and interact collects it', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))

  const result = await page.evaluate(() => {
    window.island.dispatch({ type: 'tick', dt: 3000 })
    const grew = window.island.world().tidepools[0].stone
    const w = window.island.world()
    w.player = { x: 15, y: 14, facing: 'left', cooldown: 0 } // beside the tidepool at 14,14
    window.island.load(w)
    window.island.dispatch({ type: 'interact' })
    const after = window.island.world()
    return { grew, stone: after.inventory.stone, pool: after.tidepools[0].stone }
  })
  expect(result).toEqual({ grew: true, stone: 1, pool: false })
})

test('interact facing water places a stone as sand', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))

  const result = await page.evaluate(() => {
    const w = window.island.world()
    w.player = { x: 14, y: 16, facing: 'left', cooldown: 0 } // west shore, facing open water
    w.inventory = { stone: 1 }
    window.island.load(w)
    window.island.dispatch({ type: 'interact' })
    const after = window.island.world()
    return { tile: after.tiles[16 * after.width + 13], stone: after.inventory.stone }
  })
  expect(result).toEqual({ tile: 'sand', stone: 0 })
})

test('talking to the npc runs a dialogue and sets a flag', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world()
    w.player = { x: 17, y: 15, facing: 'right', cooldown: 0 } // beside the npc at 18,15
    window.island.load(w)
  })
  await page.locator('#game canvas').click()

  await press(page, 'e', () => window.island.world().dialogue !== null)
  // Phaser steps scenes in reverse order, so the ui scene redraws the frame after island dispatched
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.island.game.scene
          .getScene('ui')
          .children.list.some((o) =>
            (o as Phaser.GameObjects.Text).text?.includes('[PLACEHOLDER greeting]'),
          ),
      ),
    )
    .toBe(true)
  await page.locator('#game canvas').screenshot({ path: 'test-results/dialogue.png' })

  await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
  await press(page, 'e', () => window.island.world().flags.npc1_met === true)
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(await page.evaluate(() => window.island.world().flags.npc1_choice)).toBe(2)
})

test('renders the island for humans to eyeball', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').screenshot({ path: 'test-results/island.png' })
})
