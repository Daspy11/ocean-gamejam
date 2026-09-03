import { expect, test, type Page } from '@playwright/test'

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

// what the box is on: key and node together, plus the raw text, since an act node has none and
// needs ticks rather than a keypress
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return { id: `${w.dialogue.key}/${w.dialogue.node}`, text: node?.text ?? null }
  })

// tap 'e' until the box has moved off `id` (or closed)
const nextNode = (page: Page, id: string) =>
  press(
    page,
    'e',
    (was) => {
      const d = window.island.world().dialogue
      return !d || `${d.key}/${d.node}` !== was
    },
    id,
  )

// every line the box shows on the way to the end, taking the first option at every choice
async function playOut(page: Page): Promise<string[]> {
  const seen: string[] = []
  for (let n = 0; n < 300; n++) {
    const on = await at(page)
    if (!on) break
    if (on.text === null) {
      await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
      continue
    }
    const line = on.text.split('{')[0].slice(0, 20) // {score} is filled in, so match the plain head
    await expect.poll(() => texts(page)).toContain(line) // the ui draws a frame behind the sim
    seen.push(await texts(page))
    await nextNode(page, on.id)
  }
  return seen
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
  await expect.poll(() => texts(page)).toContain("didn't know trees")
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

test('Walter walking to a tree that already left stops where it stood', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // on the far island's sand at 23,17, facing crate2
    window.island.load({
      ...w,
      flags: { 'had:electrolytes': true, 'tree:gone': true },
      objects: w.objects.filter((o) => o.id !== 'tree1'),
      player: { ...w.player, x: 23, y: 17, facing: 'right' },
    })
    window.island.dispatch({ type: 'interact' }) // opening it starts the flower scene
  })
  await page.locator('#game canvas').click()

  const seen = await playOut(page)
  const walter = await page.evaluate(() =>
    window.island.world().objects.find((o) => o.id === 'walter'),
  )
  expect(walter).toMatchObject({ x: 15, y: 14 }) // the tile the tree used to be on, not under it
  const left = seen.findIndex((line) => line.includes('made the tree leave'))
  const hat = seen.findIndex((line) => line.includes('oh yeah'))
  expect(left).toBeGreaterThan(-1) // the branch the tree:gone flag picked
  expect(hat).toBeGreaterThan(left)
})

test('the tree leaving from over Walter head carries on into his sunburn', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // Walter settled under tree1, the player at 15,15 looking up
    w.objects.push({
      id: 'walter',
      kind: 'npc',
      sprite: 'walter',
      x: 14,
      y: 14,
      facing: 'down',
      dialogue: 'walter',
    })
    window.island.load({
      ...w,
      flags: { 'tree:promised': false, 'walter:under': true, 'score:on': true },
      objects: w.objects.map((o) => (o.id === 'tree1' ? { ...o, shakes: 11 } : o)),
      player: { ...w.player, x: 15, y: 15, facing: 'up' },
    })
  })
  await page.locator('#game canvas').click()

  await press(page, 'e', () => window.island.world().dialogue?.key === 'tree')
  await expect.poll(() => texts(page)).toContain('shake it?')
  await press(page, 'e', () => window.island.world().dialogue?.key === 'got') // yes: the twelfth
  await press(page, 'e', () => window.island.world().dialogue?.key === 'treealive')
  await expect.poll(() => texts(page)).toContain('stop doing that')

  await press(page, 'e', () => window.island.world().dialogue?.node === 'no') // the first choice
  await nextNode(page, 'treealive/no') // on into the fly act
  await page.evaluate(() => {
    for (let n = 0; n < 8 && window.island.world().dialogue?.node === 'fly'; n++)
      window.island.dispatch({ type: 'tick', dt: 250 })
  })
  expect(await page.evaluate(() => window.island.world().dialogue?.node)).toBe('gone')
  await expect.poll(() => texts(page)).toContain("didn't know trees")

  for (const [node, line] of [
    ['sun1', 'sunburned'],
    ['sun2', 'hat'],
    ['sun3', 'oh yeah'],
  ]) {
    await press(page, 'e', (want) => window.island.world().dialogue?.node === want, node)
    await expect.poll(() => texts(page)).toContain(line)
  }
  await press(page, 'e', () => window.island.world().dialogue === null)
})
