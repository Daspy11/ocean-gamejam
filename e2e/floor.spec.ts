import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts
async function press(page: Page, key: string, until: () => boolean) {
  await page.keyboard.down(key)
  await page.waitForFunction(until)
  await page.keyboard.up(key)
}

// on the east shore at 20,16: grass inland at 19,16, open sea at 21,16
const shore = (page: Page, facing: string) =>
  page.evaluate((f) => {
    const w = window.island.world()
    w.player = { ...w.player, x: 20, y: 16, facing: f as typeof w.player.facing, step: null }
    w.inventory = { carpet: 1, orb: 1 }
    w.flags = { 'score:on': true, 'had:carpet': true, 'had:orb': true }
    window.island.load(w)
  }, facing)

test('E on an item in the inventory uses it: the carpet goes down and the bag shuts', async ({
  page,
}) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await shore(page, 'left')
  await page.locator('#game canvas').click()

  await press(page, 'i', () => window.island.world().menu !== null)
  await press(page, 'e', () => window.island.world().menu === null)
  const w = await page.evaluate(() => window.island.world())
  expect(w.objects.find((o) => o.kind === 'floor')).toMatchObject({ x: 19, y: 16 })
  expect([w.inventory.carpet, w.score]).toEqual([0, 5])
  await page.locator('#game canvas').screenshot({ path: 'test-results/floor.png' })

  // flat on the ground: he walks over it rather than being stopped by it
  await press(page, 'ArrowLeft', () => window.island.world().player.x === 19)
})

test('Enter throws the fire orb out of the inventory and closes it', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await shore(page, 'right')
  await page.locator('#game canvas').click()

  await press(page, 'i', () => window.island.world().menu !== null)
  // the carpet is the cursor's first slot and does nothing facing the sea, so step onto the orb
  await press(page, 'ArrowRight', () => window.island.world().menu?.cursor === 1)
  await press(page, 'Enter', () => window.island.world().menu === null)
  const w = await page.evaluate(() => window.island.world())
  expect(w.objects.find((o) => o.kind === 'orb')).toMatchObject({ x: 21, y: 16 })
  expect(w.inventory.orb).toBe(0)
})
