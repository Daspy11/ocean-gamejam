import { expect, test, type Page } from '@playwright/test'
import { DUAL_FRAME } from '../src/assets'

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

// what the box is on right now: an act node has no text, so it needs ticks rather than a keypress.
// `id` is key and node together, because the got box and the crate line both start on a node '1'
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return {
      key: w.dialogue.key,
      node: w.dialogue.node,
      id: `${w.dialogue.key}/${w.dialogue.node}`,
      text: node?.text ?? null,
    }
  })

// the far island's sand at 23,17, facing crate2: opening the crate is what starts the whole scene
const openCrate2 = async (page: Page) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, player: { ...w.player, x: 23, y: 17, facing: 'right' } })
    window.island.dispatch({ type: 'interact' })
  })
  await page.locator('#game canvas').click()
}

// hold 'e' until the box has moved off `id` (or closed); an act node has no text and takes ticks
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

test('opening the second crate plays the flower scene and brings Walter in', async ({ page }) => {
  test.setTimeout(60000)
  await openCrate2(page)
  // the got box first, then Mich's crate line, and the flower scene behind them both
  expect(await page.evaluate(() => window.island.world().queue.map((q) => q.key))).toEqual([
    'crate',
    'flower',
  ])

  const picked = new Set<string>()
  let crabLine = ''
  for (let n = 0; n < 300; n++) {
    const on = await at(page)
    if (!on) break
    if (on.id === 'flower/18' && !crabLine) {
      await expect.poll(() => texts(page, 'ui')).toContain('at least 10 beauty')
      crabLine = await texts(page, 'ui')
      await page.locator('#game canvas').screenshot({ path: 'test-results/walter.png' })
    }
    // the long way round: no, no, no, and then the crab question rather than walking off
    const choose = ['a1', 'a2', 'a4', '29'].includes(on.node)
    if (on.key === 'flower' && choose && !picked.has(on.node)) {
      await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
      picked.add(on.node)
    }
    if (on.text !== null) await nextNode(page, on.id)
    else await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
  }

  expect([...picked]).toEqual(['a1', 'a2', 'a4', '29'])
  expect(crabLine).toContain('at least 10 beauty') // {score} filled in from the flower that bloomed
  const after = await page.evaluate(() => {
    const w = window.island.world()
    const obj = (id: string) => w.objects.find((o) => o.id === id)
    return { world: w, mich: obj('mich'), flower: obj('flower1'), walter: obj('walter') }
  })
  expect(after.world.dialogue).toBe(null)
  expect(after.mich).toMatchObject({ x: 24, y: 15, facing: 'right' })
  expect(after.flower).toMatchObject({ x: 25, y: 15, white: true })
  expect(after.walter).toMatchObject({ x: 17, y: 16 }) // settled in beside tree1 at 16,16
  expect(after.world.score).toBe(10)
  expect(after.world.inventory.electrolytes).toBe(1) // she never got to eat them on this route
  expect(after.world.flags['score:on']).toBe(true)
  expect(after.world.flags['fired:flower']).toBe(true)
  expect(after.world.flags['ate:electrolytes']).toBeUndefined()

  await expect.poll(() => texts(page, 'ui')).toContain('beauty: 10') // the hud counts beauty now
})

test('saying yes to Mich feeds her the electrolytes out of the inventory', async ({ page }) => {
  test.setTimeout(30000)
  await openCrate2(page)

  // every choice defaults to its first option, which is yes, so the box walks itself to the eat node
  for (let n = 0; n < 100; n++) {
    const on = await at(page)
    if (!on || on.id === 'flower/2') break
    if (on.text !== null) await nextNode(page, on.id)
    else await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
  }

  const fed = await page.evaluate(() => {
    const w = window.island.world()
    return { left: w.inventory.electrolytes, ate: w.flags['ate:electrolytes'], node: w.dialogue }
  })
  expect(fed.left).toBeUndefined() // the last of them went, so the slot went with it
  expect(fed.ate).toBe(true)
  expect(fed.node).toMatchObject({ key: 'flower', node: '2' })
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

test('examining the wreck the intro left you beside', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // the spawn at 14,16, turned back to the wreck at 12..13,16
    window.island.load({ ...w, player: { ...w.player, facing: 'left' } })
  })
  await page.locator('#game canvas').click()

  await press(page, 'e', () => window.island.world().dialogue?.key === 'boat')
  await expect.poll(() => texts(page, 'ui')).toContain('smashed in')
  await press(page, 'e', () => window.island.world().dialogue === null)
})

test('terrains meeting on a diagonal leave no water notch between them', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const w = window.island.world() // salt at 14,20 corners the grass at 15,19, sand on the other two
    w.tiles[20 * w.width + 14] = 'salt'
    window.island.load(w)
  })

  const frames = await page.evaluate(async () => {
    const scene = window.island.game.scene.getScene('island')
    const cam = scene.cameras.main
    cam.stopFollow()
    cam.setZoom(6).centerOn(15 * 16, 20 * 16)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const layers = scene.children.list as Phaser.Tilemaps.TilemapLayer[]
    const cell = (name: string) =>
      layers.find((o) => o.layer?.name === name)!.getTileAt(15, 20, true).index
    return [cell('salt'), cell('sand'), cell('grass')]
  })
  // salt fills the cell, sand rounds one corner off it, and grass keeps only its top-right tile
  expect(frames).toEqual([DUAL_FRAME[15], DUAL_FRAME[11], DUAL_FRAME[2]])
  await page.locator('#game canvas').screenshot({ path: 'test-results/layering.png' })
})
