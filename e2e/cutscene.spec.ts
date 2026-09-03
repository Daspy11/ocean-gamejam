import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: (arg: string) => boolean, arg = '') {
  await page.keyboard.down(key)
  await page.waitForFunction(until, arg)
  await page.keyboard.up(key)
}

const texts = (page: Page, scene: string) =>
  page.evaluate(
    (key) =>
      window.island.game.scene
        .getScene(key)
        .children.list.map((o) => (o as Phaser.GameObjects.Text).text ?? '')
        .join('\n'),
    scene,
  )

// what the box is on right now: an act node has no text, so it needs ticks rather than a keypress
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return { key: w.dialogue.key, node: w.dialogue.node, text: node?.text ?? null }
  })

test('talking to Mich with the electrolytes plays the flower scene and brings Walter in', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // north of mich at 13,15, with the crate already looted
    w.player = { ...w.player, x: 13, y: 14, facing: 'down' }
    window.island.load({ ...w, flags: { 'had:electrolytes': true } })
    window.island.dispatch({ type: 'interact' })
  })
  await page.locator('#game canvas').click()
  expect(await page.evaluate(() => window.island.world().dialogue?.key)).toBe('flower')

  let picked = false
  let crabLine = ''
  for (let n = 0; n < 200; n++) {
    const on = await at(page)
    if (!on) break
    if (on.node === '18' && !crabLine) {
      await expect.poll(() => texts(page, 'ui')).toContain('at least 10 beauty')
      crabLine = await texts(page, 'ui')
      await page.locator('#game canvas').screenshot({ path: 'test-results/walter.png' })
    }
    // the second choice is the one that runs the "real crab" branch
    if (on.node === '29' && !picked) {
      await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
      picked = true
    }
    if (on.text !== null)
      await press(page, 'e', (was) => window.island.world().dialogue?.node !== was, on.node)
    else await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
  }

  expect(crabLine).toContain('at least 10 beauty') // {score} filled in from the flower that bloomed
  const after = await page.evaluate(() => {
    const w = window.island.world()
    const obj = (id: string) => w.objects.find((o) => o.id === id)
    return { world: w, mich: obj('mich'), flower: obj('flower1'), walter: obj('walter') }
  })
  expect(after.world.dialogue).toBe(null)
  expect(after.mich).toMatchObject({ x: 16, y: 13, facing: 'right' })
  expect(after.flower).toMatchObject({ x: 17, y: 13, white: true })
  expect(after.walter).toMatchObject({ x: 14, y: 14, facing: 'down' })
  expect(after.world.score).toBe(10)
  expect(after.world.flags['score:on']).toBe(true)
  expect(after.world.flags['fired:flower']).toBe(true)

  await expect.poll(() => texts(page, 'ui')).toContain('beauty: 10') // the hud counts beauty now
})

test('paving the sea over costs a beauty and Mich says so', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // east beach, facing the open water at 21,16
    w.player = { ...w.player, x: 20, y: 16, facing: 'right' }
    window.island.load({ ...w, inventory: { salt: 1 }, score: 10, flags: { 'score:on': true } })
    window.island.dispatch({ type: 'interact' })
  })
  await page.locator('#game canvas').click()

  const after = await page.evaluate(() => {
    const w = window.island.world()
    return { tile: w.tiles[16 * w.width + 21], score: w.score, key: w.dialogue?.key }
  })
  expect(after).toEqual({ tile: 'salt', score: 9, key: 'insalting' })
  await expect.poll(() => texts(page, 'ui')).toContain('making the island ugly')
  await expect.poll(() => texts(page, 'ui')).toContain('beauty: 9')

  await press(page, 'e', () => window.island.world().dialogue?.node === '2')
  await expect.poll(() => texts(page, 'ui')).toContain('how insalting')
  await press(page, 'e', () => window.island.world().dialogue === null)
})

test('reading the sign on the second island', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // just south of sign1 at 25,16, looking up at it
    window.island.load({ ...w, player: { ...w.player, x: 25, y: 17, facing: 'up' } })
    window.island.dispatch({ type: 'interact' })
  })
  expect(await page.evaluate(() => window.island.world().dialogue?.key)).toBe('sign')
  await expect.poll(() => texts(page, 'ui')).toContain('NO pirates')
})
