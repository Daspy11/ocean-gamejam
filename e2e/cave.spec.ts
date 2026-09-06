import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: (arg: string) => boolean, arg = '') {
  await page.keyboard.down(key)
  await page.waitForFunction(until, arg)
  await page.keyboard.up(key)
}

// drops into gameplay with the player put wherever the test needs him, holding nothing
const openIsland = async (page: Page, put: object) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it
  await page.evaluate((at) => {
    const w = window.island.world()
    window.island.load({
      ...w,
      ...at,
      player: { ...w.player, ...(at as { player: object }).player },
    })
  }, put)
}

const player = (page: Page) => page.evaluate(() => window.island.world().player)

test('walking into the cave mouth comes out in the room under the map', async ({ page }) => {
  await openIsland(page, { player: { x: 42, y: 18, facing: 'up' } })

  // cave1 sits on the clear tile at 42,17; stepping on it puts him down at 10,40, still walking north
  await press(page, 'ArrowUp', () => window.island.world().player.y === 40)
  await page.waitForFunction(() => window.island.world().player.step === null)
  const inside = await player(page)
  expect(inside.x).toBe(10)
  expect(inside.y).toBeLessThanOrEqual(40) // the held key carries him up the room, rum1 stops him
  expect(inside.y).toBeGreaterThanOrEqual(38)
  await page.locator('#game canvas').screenshot({ path: 'test-results/cave.png' })

  // the bottle at 10,37 is carried off whole, sprite and all
  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, player: { ...w.player, x: 10, y: 38, facing: 'up', held: null } })
  })
  const bottles = () =>
    page.evaluate(
      () =>
        (
          window.island.game.scene.getScene('island').children.list as Phaser.GameObjects.Sprite[]
        ).filter((o) => o.texture?.key === 'sprites/rum').length,
    )
  await expect.poll(bottles).toBe(1)
  await press(page, 'e', () => window.island.world().inventory.rum === 1)
  await expect.poll(bottles).toBe(0)
  await press(page, 'e', () => window.island.world().dialogue === null) // dismiss the got box

  // and the sand tile at 10,41 is the way back out, below the mouth on the big island
  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, player: { ...w.player, x: 10, y: 40, facing: 'down', held: null } })
  })
  await press(page, 'ArrowDown', () => window.island.world().player.x === 42)
  await page.waitForFunction(() => window.island.world().player.step === null)
  const out = await player(page)
  // the corridor runs on down to the gate at 42,21, so the held key may carry him a tile or two
  expect(out.x).toBe(42)
  expect(out.y).toBeGreaterThanOrEqual(18)
  expect(out.y).toBeLessThanOrEqual(20)
})

test('the gate on the corridor to the cave says locked, and opens for the key', async ({
  page,
}) => {
  await openIsland(page, { player: { x: 42, y: 22, facing: 'up' } }) // gate1 at 42,21
  await press(page, 'e', () => window.island.world().dialogue?.key === 'gate')
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(
    await page.evaluate(() => window.island.world().objects.some((o) => o.id === 'gate1')),
  ).toBe(true)

  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, inventory: { key: 1 }, flags: { 'had:key': true } })
  })
  await press(page, 'e', () => !window.island.world().objects.some((o) => o.id === 'gate1'))
  expect(await page.evaluate(() => window.island.world().inventory)).toEqual({})
  // and the way up the corridor is clear to the mouth, which puts him down in the room
  await press(page, 'ArrowUp', () => window.island.world().player.y === 40)
  expect((await player(page)).x).toBe(10)
})

test('the albatross trades the golden egg for ten twigs', async ({ page }) => {
  await openIsland(page, { player: { x: 36, y: 21, facing: 'up' }, inventory: { twig: 10 } })

  const node = (id: string) =>
    press(page, 'e', (at) => window.island.world().dialogue?.node === at, id)
  await press(page, 'e', () => window.island.world().dialogue?.key === 'albatross')
  await node('2')
  await node('3twigs') // the branch he only takes with ten twigs in the bag

  await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
  await node('4')
  await node('5')

  const traded = await page.evaluate(() => {
    const w = window.island.world()
    return { twig: w.inventory.twig, egg: w.inventory.egg, queue: w.queue.map((q) => q.key) }
  })
  expect(traded).toEqual({ twig: undefined, egg: 1, queue: ['got'] })

  await press(page, 'e', () => window.island.world().dialogue?.key === 'got')
  expect(await page.evaluate(() => window.island.world().dialogue?.item)).toBe('egg')
})

test('salt laid out of reach of the island costs no beauty', async ({ page }) => {
  await openIsland(page, {
    player: { x: 32, y: 16, facing: 'left' }, // the big island's west beach, facing open sea
    inventory: { salt: 1 },
    score: 10,
    flags: { 'score:on': true },
  })
  await page.evaluate(() => window.island.dispatch({ type: 'interact' }))

  const after = await page.evaluate(() => {
    const w = window.island.world()
    return { tile: w.tiles[16 * w.width + 31], score: w.score, key: w.dialogue?.key }
  })
  expect(after).toEqual({ tile: 'salt', score: 10, key: 'away' })
})
