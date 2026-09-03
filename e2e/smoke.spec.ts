import { expect, test, type Page } from '@playwright/test'
import { DUAL_FRAME } from '../src/assets'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts.
async function press(page: Page, key: string, until: (arg: string) => boolean, arg = '') {
  await page.keyboard.down(key)
  await page.waitForFunction(until, arg)
  await page.keyboard.up(key)
}

// the menu and the intro are not in `world`, so there is nothing to poll: hold for a few frames
async function tap(page: Page, key: string) {
  await page.keyboard.down(key)
  await page.waitForTimeout(80)
  await page.keyboard.up(key)
  await page.waitForTimeout(80)
}

// ?scene=island skips the menu and the cutscene, so every gameplay test opens the game this way
const openIsland = async (page: Page) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
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

test('boots into the menu, Enter starts the intro and Escape skips it', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('menu'))
  expect(await texts(page, 'menu')).toContain('start')
  await page.locator('#game canvas').screenshot({ path: 'test-results/menu.png' })

  const on = (key: string) => page.evaluate((k) => window.island.game.scene.isActive(k), key)
  await tap(page, 'Enter')
  await expect.poll(() => on('intro')).toBe(true)
  await expect.poll(() => texts(page, 'intro')).toContain("i knew we shouldn't")
  await page.locator('#game canvas').screenshot({ path: 'test-results/intro.png' })

  await tap(page, 'Escape')
  await expect.poll(() => on('island')).toBe(true)
  // skipping the cutscene still drops you into the landing conversation
  expect(await page.evaluate(() => window.island.world().dialogue?.key)).toBe('landing')
})

test('playing the intro through lands on the island and opens the landing talk', async ({
  page,
}) => {
  test.setTimeout(25000)
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('menu'))
  await tap(page, 'Enter')
  await page.waitForFunction(() => window.island.game.scene.isActive('intro'))

  const onIsland = () => page.evaluate(() => window.island.game.scene.isActive('island'))
  for (let i = 0; i < 20 && !(await onIsland()); i++) await tap(page, 'e')
  await expect.poll(onIsland, { timeout: 10000 }).toBe(true)

  const landed = await page.evaluate(() => {
    const w = window.island.world()
    return {
      boat: w.objects.some((o) => o.kind === 'boat'),
      x: w.player.x,
      y: w.player.y,
      talking: w.dialogue?.key,
    }
  })
  expect(landed).toEqual({ boat: true, x: 14, y: 16, talking: 'landing' })

  // six nodes; the loop is generous because a stray 'e' from the intro can advance the first one
  const talking = () => page.evaluate(() => window.island.world().dialogue !== null)
  for (let i = 0; i < 10 && (await talking()); i++) await tap(page, 'e')
  await expect.poll(talking).toBe(false)
})

test('boots the island scene with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await openIsland(page)
  await expect(page.locator('#game canvas')).toBeVisible()
  await page.locator('#game canvas').screenshot({ path: 'test-results/island.png' }) // to eyeball
  expect(errors).toEqual([])
})

test('tick advances sim time', async ({ page }) => {
  await openIsland(page)

  // read both sides in one evaluate so the scene's own per-frame tick can't land between them
  const advanced = await page.evaluate(() => {
    const at = window.island.world().time
    window.island.dispatch({ type: 'tick', dt: 3000 })
    return window.island.world().time - at
  })
  expect(advanced).toBe(3000)
})

test('holding an arrow key walks the player and releasing stops it', async ({ page }) => {
  await openIsland(page)
  await page.locator('#game canvas').click()

  const start = await page.evaluate(() => window.island.world().player.x)
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction((x) => window.island.world().player.x !== x, start)
  await page.keyboard.up('ArrowRight')
  await page.waitForFunction(() => {
    const p = window.island.world().player
    return p.step === null && p.held === null
  })

  const player = await page.evaluate(() => window.island.world().player)
  // one or two tiles walked, depending on release timing
  expect([player.x >= start + 1, player.facing, player.held]).toEqual([true, 'right', null])
})

test('tapping a direction turns the player without walking', async ({ page }) => {
  await openIsland(page)
  await page.locator('#game canvas').click()
  await page.waitForTimeout(150) // let Phaser's frame delta settle before a timing-sensitive tap

  const start = await page.evaluate(() => window.island.world().player)
  await press(page, 'ArrowUp', () => window.island.world().player.facing === 'up')
  await page.waitForTimeout(200) // longer than the 100ms turn delay: a released key must not walk

  const player = await page.evaluate(() => window.island.world().player)
  expect([player.facing, player.x, player.y, player.step]).toEqual(['up', start.x, start.y, null])
})

test('an orb thrown in the sea boils its tile into salt', async ({ page }) => {
  await openIsland(page)

  const result = await page.evaluate(() => {
    const w = window.island.world()
    w.objects.push({ id: 'orb1', kind: 'orb', x: 21, y: 16, doneAt: w.time + 2000 })
    w.player = { ...w.player, x: 20, y: 16, facing: 'right' } // the east beach, facing the gap
    // both boxes are the tutorial test's job
    window.island.load({ ...w, flags: { 'fired:firstsalt': true, 'had:orb': true } })
    window.island.dispatch({ type: 'tick', dt: 2000 })
    const orbs = () => window.island.world().objects.filter((o) => o.kind === 'orb').length
    const boiled = window.island.world()
    const still = orbs() // the orb stays put, now sitting on the crust it boiled
    window.island.dispatch({ type: 'interact' }) // and comes back off the salt on interact
    const orb = window.island.world().inventory.orb
    return { tile: boiled.tiles[16 * boiled.width + 21], still, left: orbs(), orb }
  })
  expect(result).toEqual({ tile: 'salt', still: 1, left: 0, orb: 1 })
})

test('two salt bridge the gap to the second island', async ({ page }) => {
  await openIsland(page)
  await page.locator('#game canvas').click()

  // interact facing the water at 20,16 lays a salt tile; step onto it and lay the second
  for (const from of [20, 21])
    await page.evaluate((x) => {
      const w = window.island.world()
      w.player = { ...w.player, x, y: 16, facing: 'right', step: null, held: null }
      if (x === 20) w.inventory = { salt: 2 }
      window.island.load(w)
      window.island.dispatch({ type: 'interact' })
    }, from)

  await press(page, 'ArrowRight', () => window.island.world().player.x >= 23)
  await page.waitForFunction(() => window.island.world().player.step === null)
  const crossed = await page.evaluate(() => {
    const w = window.island.world()
    const tile = (x: number) => w.tiles[16 * w.width + x]
    // the key is released on arrival, so the last step may carry one tile further inland
    return { bridge: [tile(21), tile(22)], ashore: w.player.x >= 23, salt: w.inventory.salt }
  })
  expect(crossed).toEqual({ bridge: ['salt', 'salt'], ashore: true, salt: 0 })
  await page.locator('#game canvas').screenshot({ path: 'test-results/bridge.png' })
})

test('talking to the npc runs a dialogue and sets a flag', async ({ page }) => {
  await openIsland(page)
  await page.evaluate(() => {
    const w = window.island.world() // north of mich at 13,15
    window.island.load({ ...w, player: { ...w.player, x: 13, y: 14, facing: 'down' } })
  })
  await page.locator('#game canvas').click()

  await press(page, 'e', () => window.island.world().dialogue !== null)
  // Phaser steps scenes in reverse order, so the ui scene redraws the frame after island dispatched
  await expect.poll(() => texts(page, 'ui')).toContain('[PLACEHOLDER greeting]')
  const npc = await page.evaluate(() => window.island.world().objects.find((o) => o.id === 'mich'))
  expect(npc && npc.kind === 'npc' && npc.facing).toBe('up') // the npc turns to face the player
  await page.locator('#game canvas').screenshot({ path: 'test-results/dialogue.png' })

  await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
  await press(page, 'e', () => window.island.world().flags.mich_met === true)
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(await page.evaluate(() => window.island.world().flags.mich_choice)).toBe(2)
})

test('the crate beside the wreck gives up the orb exactly once', async ({ page }) => {
  await openIsland(page)

  const result = await page.evaluate(() => {
    const w = window.island.world() // crate1 sits at 13,17
    window.island.load({ ...w, player: { ...w.player, x: 14, y: 17, facing: 'left' } })
    window.island.dispatch({ type: 'interact' })
    const once = window.island.world().inventory.orb
    window.island.dispatch({ type: 'interact' })
    const after = window.island.world()
    const crate = after.objects.find((o) => o.id === 'crate1')
    return { once, twice: after.inventory.orb, open: crate?.kind === 'crate' && crate.open }
  })
  expect(result).toEqual({ once: 1, twice: 1, open: true })
})

test('the second crate on the far island holds the horse electrolytes', async ({ page }) => {
  await openIsland(page)
  await page.evaluate(() => {
    const w = window.island.world() // crate2 sits at 24,17; stand on the sand just west of it
    w.player = { ...w.player, x: 23, y: 17, facing: 'right' }
    // Mich's crate line is the tutorial test's job, so only the flower scene is left to queue
    window.island.load({ ...w, flags: { 'fired:crate': true } })
  })
  await page.locator('#game canvas').click()

  await press(page, 'e', () => window.island.world().dialogue?.key === 'got')
  expect(await page.evaluate(() => window.island.world().inventory)).toEqual({ electrolytes: 1 })
  await expect.poll(() => texts(page, 'ui')).toContain('horse electrolytes') // {item} in the box

  // the got box gone, the flower scene takes over on its walk act: Mich is running over already
  await press(page, 'e', () => window.island.world().dialogue?.key === 'flower')
  const mich = await page.evaluate(() => window.island.world().objects.find((o) => o.id === 'mich'))
  expect(mich?.kind === 'npc' && !!(mich.step || mich.path?.length)).toBe(true)
})

test('the inventory screen opens with the held items and closes again', async ({ page }) => {
  await openIsland(page)
  await page.evaluate(() => {
    const w = window.island.world() // beauty needs the flag
    const inventory = { salt: 2, orb: 1 }
    window.island.load({ ...w, inventory, score: 7, flags: { 'score:on': true } })
  })
  await page.locator('#game canvas').click()

  await press(page, 'i', () => window.island.world().menu !== null)
  await expect.poll(() => texts(page, 'ui')).toContain('beauty: 7') // the hud counts beauty now
  // no salt counter any more, and the cursor is on the salt, so the orb's name is not up yet
  await expect.poll(() => texts(page, 'ui')).not.toMatch(/salt:|Orb Of/)
  await page.locator('#game canvas').screenshot({ path: 'test-results/inventory.png' })

  await press(page, 'ArrowRight', () => window.island.world().menu?.cursor === 1)
  await expect.poll(() => texts(page, 'ui')).toContain('Orb Of Endless Burning')

  await press(page, 'Escape', () => window.island.world().menu === null)
})

test('the dual-grid ground layers autotile the island edges', async ({ page }) => {
  await openIsland(page)

  const grid = await page.evaluate(() => {
    const list = window.island.game.scene.getScene('island').children
      .list as Phaser.Tilemaps.TilemapLayer[]
    const salt = list.find((o) => o.layer?.name === 'salt')!
    const sand = list.find((o) => o.layer?.name === 'sand')!
    const grass = list.find((o) => o.layer?.name === 'grass')!
    return {
      sandCorner: sand.getTileAt(15, 12).index, // only the bottom-right logical tile is sand
      sandEdge: sand.getTileAt(15, 13).index, // sand top-right and bottom-left, grass (so: sand) bottom-right
      grassCorner: grass.getTileAt(15, 13).index,
      open: sand.getTileAt(0, 0, true).index, // open sea: no sand at any corner, so no frame
      offsets: [salt.x, salt.y, sand.x, sand.y, grass.x, grass.y],
    }
  })
  // the frame is not the mask itself: the 5x3 sheet layout puts each combination somewhere else
  expect(grid).toEqual({
    sandCorner: DUAL_FRAME[8],
    sandEdge: DUAL_FRAME[14],
    grassCorner: DUAL_FRAME[8],
    open: -1,
    offsets: Array(6).fill(-8),
  })
})

test('objects sort by the bottom of their footprint', async ({ page }) => {
  await openIsland(page)

  const depths = await page.evaluate(() => {
    const list = window.island.game.scene.getScene('island').children
      .list as Phaser.GameObjects.Sprite[]
    const feet = (k: string) => list.find((o) => o.texture?.key === `sprites/${k}`)?.depth
    return { tree: feet('tree'), crate: feet('crate'), mich: feet('mich') }
  })
  // tree1 at 16,16, crate1 at 13,17, mich at 13,15: each sorted by the tile its feet are on
  expect(depths).toEqual({ tree: (16 + 1) * 16, crate: (17 + 1) * 16, mich: (15 + 1) * 16 })
})

test('the tutorial runs from the crate to the first salt out of the sea', async ({ page }) => {
  test.setTimeout(40000)
  await openIsland(page)
  await page.evaluate(() => {
    const w = window.island.world() // crate1 is at 13,17
    window.island.load({ ...w, player: { ...w.player, x: 14, y: 17, facing: 'left' } })
  })
  await page.locator('#game canvas').click()

  // 1. the crate: the got box first, Mich's line queued behind it
  await press(page, 'e', () => window.island.world().dialogue?.key === 'got')
  expect(await page.evaluate(() => window.island.world().dialogue?.item)).toBe('orb')
  await expect.poll(() => texts(page, 'ui')).toContain("Lord Tarqualius' Orb Of Endless Burning")
  await page.locator('#game canvas').screenshot({ path: 'test-results/tutorial.png' })
  await press(page, 'e', () => window.island.world().dialogue?.key === 'crate')
  await press(page, 'e', () => window.island.world().dialogue?.node === '2')
  await press(page, 'e', () => window.island.world().dialogue === null)

  // 2. closing the inventory is what plays the next beat, and the beat renames the orb
  await press(page, 'i', () => window.island.world().menu !== null)
  await press(page, 'i', () => window.island.world().dialogue?.key === 'inventory1')
  for (const node of ['2', '3', '4', '5'])
    await press(page, 'e', (at) => window.island.world().dialogue?.node === at, node)
  await press(page, 'e', () => window.island.world().dialogue === null)
  const named = () => page.evaluate(() => window.island.world().flags['name:orb'])
  expect(await named()).toBe("tarq's Orb Of Endless Burning")

  // 3. and again, for the shorter name
  await press(page, 'i', () => window.island.world().menu !== null)
  await press(page, 'i', () => window.island.world().dialogue?.key === 'inventory2')
  await press(page, 'e', () => window.island.world().dialogue?.node === '2')
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(await named()).toBe('fire orb')

  // 4. stand on the south-west shore, throw it at the water tile at 13,18, and wait out the boil
  const sea = await page.evaluate(() => {
    const w = window.island.world()
    w.player = { ...w.player, x: 14, y: 18, facing: 'left', step: null, held: null }
    window.island.load(w)
    window.island.dispatch({ type: 'interact' })
    const at = window.island.world().objects.find((o) => o.kind === 'orb')
    window.island.dispatch({ type: 'tick', dt: 2000 })
    const after = window.island.world()
    const tile = after.tiles[18 * after.width + 13]
    return { thrown: [at?.x, at?.y], orb: after.inventory.orb, tile, box: after.dialogue?.key }
  })
  expect(sea).toEqual({ thrown: [13, 18], orb: 0, tile: 'salt', box: 'firstsalt' })
  await press(page, 'e', () => window.island.world().dialogue === null)

  // 5. take the orb back off its crust, then dig the bare salt tile up
  const dug = await page.evaluate(() => {
    window.island.dispatch({ type: 'interact' }) // the orb
    const left = window.island.world().objects.filter((o) => o.kind === 'orb').length
    window.island.dispatch({ type: 'interact' }) // and the crust it left behind
    const w = window.island.world()
    return {
      left,
      orb: w.inventory.orb,
      salt: w.inventory.salt,
      tile: w.tiles[18 * w.width + 13],
      got: w.dialogue?.item,
    }
  })
  expect(dug).toEqual({ left: 0, orb: 1, salt: 1, tile: 'water', got: 'salt' })
  await press(page, 'e', () => window.island.world().dialogue === null)
})
