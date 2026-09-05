import { expect, test, type Page } from '@playwright/test'
import type { Dir } from '../src/game/world'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: (arg: string) => boolean, arg = '') {
  await page.keyboard.down(key)
  await page.waitForFunction(until, arg)
  await page.keyboard.up(key)
}

const texts = (page: Page) =>
  page.evaluate(() =>
    window.island.game.scene
      .getScene('ui')
      .children.list.map((o) => (o as Phaser.GameObjects.Text).text ?? '')
      .join('\n'),
  )

// puts the player down wherever the test needs him, standing still and holding nothing
const stand = (page: Page, x: number, y: number, facing: Dir) =>
  page.evaluate(
    (at) => {
      const w = window.island.world()
      window.island.load({ ...w, player: { ...w.player, ...at, step: null, held: null } })
    },
    { x, y, facing },
  )

test('the shrimp asks for his carrots and hands over the award for them', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it

  // his stool is at 49,14; the grass right below it is where you stand to talk to him
  await stand(page, 49, 15, 'up')
  await press(page, 'e', () => window.island.world().dialogue?.key === 'shrimp')
  for (const node of ['2', '3', '4'])
    await press(page, 'e', (at) => window.island.world().dialogue?.node === at, node)
  await expect.poll(() => texts(page)).toContain('carrotsch')
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(await page.evaluate(() => window.island.world().flags['shrimp:asked'])).toBe(true)

  // three strips at x 47, 49 and 51, picked from the grass gaps between them
  const spots = [
    [48, 'left'],
    [48, 'right'],
    [50, 'right'],
  ] as const
  for (let n = 0; n < 12; n++) {
    const [x, facing] = spots[n % 3]
    await stand(page, x, 16 + Math.floor(n / 3), facing)
    // the first and the last are the ones with a box to them, so those two go through the keyboard;
    // the ten in between are the same interact, dispatched, to keep the run short
    if (n === 0 || n === 11)
      await press(
        page,
        'e',
        (want) => window.island.world().inventory.carrot === Number(want),
        `${n + 1}`,
      )
    else await page.evaluate(() => window.island.dispatch({ type: 'interact' }))
    // only the very first carrot gets a got box; the rest go straight in the bag
    if (await page.evaluate(() => window.island.world().dialogue?.key === 'got'))
      await press(page, 'e', () => window.island.world().dialogue === null)
  }

  // the last one out of the ground brings him over with the award
  const picked = await page.evaluate(() => {
    const w = window.island.world()
    return {
      carrot: w.inventory.carrot,
      key: w.dialogue?.key,
      left: w.objects.some((o) => o.kind === 'carrot'),
    }
  })
  expect(picked).toEqual({ carrot: 12, key: 'carrots', left: false })
  await page.locator('#game canvas').screenshot({ path: 'test-results/farm.png' })

  await press(page, 'e', () => window.island.world().dialogue?.key === 'got')
  const awarded = await page.evaluate(() => {
    const w = window.island.world()
    return { certificate: w.inventory.certificate, item: w.dialogue?.item }
  })
  expect(awarded).toEqual({ certificate: 1, item: 'certificate' })
})
