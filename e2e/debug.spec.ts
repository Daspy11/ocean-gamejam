import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop and a Key that goes down and up inside one frame
// is never seen, so every key the menu itself reads has to be held for a few frames.
async function tap(page: Page, key: string) {
  await page.keyboard.down(key)
  await page.waitForTimeout(80)
  await page.keyboard.up(key)
  await page.waitForTimeout(80)
}

const open = (page: Page) => page.evaluate(() => window.island.game.scene.isActive('debug'))
const island = (page: Page) =>
  page.evaluate(() => ({
    active: window.island.game.scene.isActive('island'),
    paused: window.island.game.scene.isPaused('island'),
  }))

// the dev menu behind Z-Z-Z: it never ships, but it is the only way to reach the far corners fast
test('the debug menu opens on Z three times and warps the player into the cave', async ({
  page,
}) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  // ScenePlugin.pause queues the op for the next step, so poll rather than read it once. A paused
  // scene is not an active one: island stops stepping, so nothing walks behind the panel.
  await expect.poll(() => island(page)).toEqual({ active: false, paused: true })

  // the cursor moves off 'gallery' onto 'into the cave', and E runs it
  await tap(page, 'ArrowDown')
  const menu = await page.evaluate(() =>
    window.island.game.scene
      .getScene('debug')
      .children.list.map((o) => (o as Phaser.GameObjects.BitmapText).text ?? '')
      .join('\n'),
  )
  expect(menu).toContain('> into the cave')

  await tap(page, 'e')
  await expect.poll(() => open(page)).toBe(false) // running an option closes the menu behind it
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({
    x: 10,
    y: 40,
    facing: 'up',
    step: null,
  })

  // and Escape closes it again without running anything
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  await tap(page, 'Escape')
  await expect.poll(() => open(page)).toBe(false)
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({ x: 10, y: 40 })

  // Z three more times shuts it from main.ts, and the island has to come back from that too
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  await page.waitForTimeout(1100) // let the press counter age out, so the next three are fresh
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await expect.poll(() => open(page)).toBe(false)
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
})

// warping is a way out of a scene that has gone wrong, so it has to take the scene with it
test('warping cancels the cutscene that was playing', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  // flower.json opens on a walk act: the box is hidden, mich is running, and input cannot skip it
  await page.evaluate(() => window.island.dispatch({ type: 'talk', key: 'flower' }))
  await expect.poll(() => page.evaluate(() => window.island.world().dialogue?.key)).toBe('flower')
  await expect
    .poll(() =>
      page.evaluate(() => window.island.world().objects.find((o) => o.id === 'mich')?.step),
    )
    .not.toBe(null)

  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  await tap(page, 'ArrowDown') // onto 'into the cave'
  await tap(page, 'e')
  await expect.poll(() => open(page)).toBe(false)

  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({ x: 10, y: 40 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window.island.world()
        const mich = w.objects.find((o) => o.id === 'mich')
        return { dialogue: w.dialogue, queue: w.queue, step: mich?.step ?? null, path: mich?.path }
      }),
    )
    .toEqual({ dialogue: null, queue: [], step: null, path: [] })
})
