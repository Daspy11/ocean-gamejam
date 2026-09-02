import { expect, test, type Page } from '@playwright/test'

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

test('boots into the menu and Enter starts the intro', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('menu'))
  expect(await texts(page, 'menu')).toContain('start')
  await page.locator('#game canvas').screenshot({ path: 'test-results/menu.png' })

  await tap(page, 'Enter')
  await expect
    .poll(() => page.evaluate(() => window.island.game.scene.isActive('intro')))
    .toBe(true)
  await expect.poll(() => texts(page, 'intro')).toContain("i knew we shouldn't")
  await page.locator('#game canvas').screenshot({ path: 'test-results/intro.png' })
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

test('Escape skips the intro straight to the island', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.island?.game.scene.isActive('menu'))
  await tap(page, 'Enter')
  await page.waitForFunction(() => window.island.game.scene.isActive('intro'))

  await tap(page, 'Escape')
  await expect
    .poll(() => page.evaluate(() => window.island.game.scene.isActive('island')))
    .toBe(true)
  // skipping the cutscene still drops you into the landing conversation
  expect(await page.evaluate(() => window.island.world().dialogue?.key)).toBe('landing')
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
    const before = window.island.world().time
    window.island.dispatch({ type: 'tick', dt: 3000 })
    return window.island.world().time - before
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
  expect(player.x).toBeGreaterThanOrEqual(start + 1) // one or two tiles, depending on release timing
  expect(player.facing).toBe('right')
  expect(player.held).toBeNull()
})

test('tapping a direction turns the player without walking', async ({ page }) => {
  await openIsland(page)
  await page.locator('#game canvas').click()
  await page.waitForTimeout(150) // let Phaser's frame delta settle before a timing-sensitive tap

  const start = await page.evaluate(() => window.island.world().player)
  await press(page, 'ArrowUp', () => window.island.world().player.facing === 'up')
  await page.waitForTimeout(200) // longer than the 100ms turn delay: a released key must not walk

  const player = await page.evaluate(() => window.island.world().player)
  expect(player.facing).toBe('up')
  expect([player.x, player.y, player.step]).toEqual([start.x, start.y, null])
})

test('an orb floating in the sea grows salt and interact collects it', async ({ page }) => {
  await openIsland(page)

  const result = await page.evaluate(() => {
    const w = window.island.world()
    w.player = { ...w.player, x: 20, y: 16, facing: 'right' } // the east beach, facing the gap
    w.objects.push({ id: 'orb1', kind: 'orb', x: 21, y: 16, salt: false, nextAt: w.time + 3000 })
    w.flags = { 'fired:firstsalt': true, 'had:salt': true } // both boxes are the tutorial test's job
    window.island.load(w)
    window.island.dispatch({ type: 'tick', dt: 3000 })
    const crust = () => {
      const o = window.island.world().objects.find((o) => o.kind === 'orb')
      return o && o.kind === 'orb' ? o.salt : undefined
    }
    const grew = crust()
    window.island.dispatch({ type: 'interact' })
    return { grew, salt: window.island.world().inventory.salt, orb: crust() }
  })
  expect(result).toEqual({ grew: true, salt: 1, orb: false })
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
    const w = window.island.world()
    w.player = { ...w.player, x: 13, y: 14, facing: 'down' } // north of mich at 13,15
    window.island.load(w)
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
    const w = window.island.world()
    w.player = { ...w.player, x: 14, y: 17, facing: 'left' } // crate1 sits at 13,17
    window.island.load(w)
    window.island.dispatch({ type: 'interact' })
    const once = window.island.world().inventory.orb
    window.island.dispatch({ type: 'interact' })
    const after = window.island.world()
    const crate = after.objects.find((o) => o.id === 'crate1')
    return { once, twice: after.inventory.orb, open: crate?.kind === 'crate' && crate.open }
  })
  expect(result).toEqual({ once: 1, twice: 1, open: true })
})

test('the inventory screen opens with the held items and closes again', async ({ page }) => {
  await openIsland(page)
  await page.evaluate(() => {
    const w = window.island.world()
    w.inventory = { salt: 2, orb: 1 }
    window.island.load(w)
  })
  await page.locator('#game canvas').click()

  await press(page, 'i', () => window.island.world().menu !== null)
  await expect.poll(() => texts(page, 'ui')).toContain('salt: 2') // the hud counts salt now
  await expect.poll(() => texts(page, 'ui')).not.toContain('Orb Of') // the cursor is on the salt
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
      sandEdge: sand.getTileAt(15, 13).index, // sand top-right and bottom-left, grass bottom-right
      grassCorner: grass.getTileAt(15, 13).index,
      offsets: [salt.x, salt.y, sand.x, sand.y, grass.x, grass.y],
    }
  })
  expect(grid).toEqual({ sandCorner: 8, sandEdge: 6, grassCorner: 8, offsets: Array(6).fill(-8) })
})

test('objects sort by the bottom of their footprint', async ({ page }) => {
  await openIsland(page)

  const depths = await page.evaluate(() => {
    const list = window.island.game.scene.getScene('island').children
      .list as Phaser.GameObjects.Sprite[]
    const depth = (key: string) => list.find((o) => o.texture?.key === key)?.depth
    return { tree: depth('sprites/tree'), hut: depth('sprites/hut'), mich: depth('sprites/mich') }
  })
  expect(depths).toEqual({ tree: (14 + 1) * 16, hut: (17 + 2) * 16, mich: (15 + 1) * 16 })
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
  await press(page, 'e', () => window.island.world().dialogue?.node === '2')
  await press(page, 'e', () => window.island.world().dialogue?.node === '3')
  await press(page, 'e', () => window.island.world().dialogue === null)
  const named = () => page.evaluate(() => window.island.world().flags['name:orb'])
  expect(await named()).toBe("tarq's Orb Of Endless Burning")

  // 3. and again, for the shorter name
  await press(page, 'i', () => window.island.world().menu !== null)
  await press(page, 'i', () => window.island.world().dialogue?.key === 'inventory2')
  for (const node of ['2', '3', '4', '5'])
    await press(page, 'e', (at) => window.island.world().dialogue?.node === at, node)
  await press(page, 'e', () => window.island.world().dialogue === null)
  expect(await named()).toBe("tarq's fire orb")

  // 4. stand on the south-west shore, throw it at the water tile at 13,18, and wait out the 3 s
  const sea = await page.evaluate(() => {
    const w = window.island.world()
    w.player = { ...w.player, x: 14, y: 18, facing: 'left', step: null, held: null }
    window.island.load(w)
    window.island.dispatch({ type: 'interact' })
    const at = window.island.world().objects.find((o) => o.kind === 'orb')
    window.island.dispatch({ type: 'tick', dt: 3000 })
    const after = window.island.world()
    const orb = after.objects.find((o) => o.kind === 'orb')
    const salt = orb?.kind === 'orb' && orb.salt
    return { thrown: [at?.x, at?.y], orb: after.inventory.orb, salt, box: after.dialogue?.key }
  })
  expect(sea).toEqual({ thrown: [13, 18], orb: 0, salt: true, box: 'firstsalt' })
  await press(page, 'e', () => window.island.world().dialogue === null)

  // 5. collect the salt, then take the orb itself back off the water
  const collected = await page.evaluate(() => {
    window.island.dispatch({ type: 'interact' })
    const w = window.island.world()
    return { salt: w.inventory.salt, key: w.dialogue?.key, item: w.dialogue?.item }
  })
  expect(collected).toEqual({ salt: 1, key: 'got', item: 'salt' })
  await press(page, 'e', () => window.island.world().dialogue === null)

  const retrieved = await page.evaluate(() => {
    window.island.dispatch({ type: 'interact' })
    const w = window.island.world()
    return { left: w.objects.filter((o) => o.kind === 'orb').length, orb: w.inventory.orb }
  })
  expect(retrieved).toEqual({ left: 0, orb: 1 })
})
