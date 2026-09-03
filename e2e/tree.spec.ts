import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: () => boolean) {
  await page.keyboard.down(key)
  await page.waitForFunction(until)
  await page.keyboard.up(key)
}

const texts = (page: Page) =>
  page.evaluate(() =>
    window.island.game.scene
      .getScene('ui')
      .children.list.map((o) => (o as Phaser.GameObjects.Text).text ?? '')
      .join('\n'),
  )

// on the grass at 15,15, looking up at tree1
async function atTree(page: Page, y = 15) {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate((at) => {
    const w = window.island.world()
    window.island.load({ ...w, player: { ...w.player, x: 15, y: at, facing: 'up' } })
  }, y)
  await page.locator('#game canvas').click()
}

test('shaking the tree twelve times sends it away', async ({ page }) => {
  test.setTimeout(60000)
  await atTree(page)

  await press(page, 'e', () => window.island.world().dialogue?.key === 'tree')
  await expect.poll(() => texts(page)).toContain('shake it?')

  await press(page, 'e', () => (window.island.world().inventory.twig ?? 0) > 0)
  await expect.poll(() => texts(page)).toContain('you got twig')
  expect(await page.evaluate(() => window.island.world().inventory.twig)).toBe(1)

  // the rest of the twelve by hand: dismiss whatever is open, ask, say yes, let the act close
  const said = await page.evaluate(() => {
    const open = () => window.island.world().dialogue
    const keys: string[] = []
    for (let n = 2; n <= 12; n++) {
      for (let i = 0; i < 4 && open(); i++) window.island.dispatch({ type: 'interact' })
      window.island.dispatch({ type: 'interact' })
      window.island.dispatch({ type: 'interact' })
      window.island.dispatch({ type: 'tick', dt: 400 })
      const on = open()
      if (on && on.key !== 'tree') keys.push(on.key)
    }
    return keys
  })
  expect(said).toEqual(['shake3', 'shake7', 'treealive']) // each aside plays exactly once
  expect(await page.evaluate(() => window.island.world().inventory.twig)).toBe(12)
  await expect.poll(() => texts(page)).toContain('please can you stop doing that')

  // say no, then hold the frame 700 ms into the flight for the shot
  await page.evaluate(async () => {
    window.island.dispatch({ type: 'interact' }) // the first choice is no
    window.island.dispatch({ type: 'interact' }) // and on into the fly act
    window.island.dispatch({ type: 'tick', dt: 700 })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    window.island.game.loop.sleep()
  })
  expect(await page.evaluate(() => window.island.world().dialogue?.node)).toBe('fly')
  await page.locator('#game canvas').screenshot({ path: 'test-results/treefly.png' })

  await page.evaluate(() => {
    window.island.game.loop.wake()
    window.island.dispatch({ type: 'tick', dt: 800 })
  })
  const after = await page.evaluate(() => {
    const w = window.island.world()
    return { tree1: w.objects.find((o) => o.id === 'tree1'), node: w.dialogue?.node }
  })
  expect(after.tree1).toBeUndefined()
  expect(after.node).toBe('gone')
  await expect.poll(() => texts(page)).toContain('not even the tree wanted to stay')
})

test('a promised tree left alone invites a friend over when you come back', async ({ page }) => {
  await atTree(page, 18)
  // promised, and last shaken over a minute ago: four tiles away it still says nothing
  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({
      ...w,
      time: 61000,
      flags: { 'tree:promised': true },
      objects: w.objects.map((o) => (o.id === 'tree1' ? { ...o, shookAt: 0 } : o)),
    })
    window.island.dispatch({ type: 'tick', dt: 16 })
  })
  expect(await page.evaluate(() => window.island.world().dialogue)).toBe(null)

  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, player: { ...w.player, y: 17 } }) // three tiles: close enough
    window.island.dispatch({ type: 'tick', dt: 16 })
  })
  expect(await page.evaluate(() => window.island.world().dialogue?.key)).toBe('treefriend')
  await expect.poll(() => texts(page)).toContain('hi again')

  // through the spawn and the landing to the last line
  await page.evaluate(() => {
    for (let n = 0; n < 40 && window.island.world().dialogue; n++) {
      window.island.dispatch({ type: 'interact' })
      window.island.dispatch({ type: 'tick', dt: 250 })
    }
  })
  const after = await page.evaluate(() => {
    const w = window.island.world()
    return { tree2: w.objects.find((o) => o.id === 'tree2'), dialogue: w.dialogue }
  })
  expect(after.dialogue).toBe(null)
  expect(after.tree2).toMatchObject({ kind: 'tree', x: 15, y: 19 })

  const drawn = () =>
    page.evaluate(
      () =>
        (
          window.island.game.scene.getScene('island').children.list as Phaser.GameObjects.Sprite[]
        ).filter((o) => o.texture?.key === 'sprites/tree').length,
    )
  await expect.poll(drawn).toBe(2) // the old tree and the friend it called over
})
