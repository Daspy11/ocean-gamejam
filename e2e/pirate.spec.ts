import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold the key until the box has moved on
async function press(page: Page, node: string) {
  await page.keyboard.down('e')
  await page.waitForFunction((was) => window.island.world().dialogue?.node !== was, node)
  await page.keyboard.up('e')
}

// what the box is on: key and node together, plus the text, since an act node has none and needs
// ticks rather than a keypress
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return { id: `${w.dialogue.key}/${w.dialogue.node}`, key: w.dialogue.key, text: node?.text }
  })

// the ship and the pirate as the world has them, or null until the scene has spawned them
const cast = (page: Page) =>
  page.evaluate(() => {
    const find = (id: string) => window.island.world().objects.find((o) => o.id === id)
    const ship = find('ship')
    const man = find('etarp')
    return {
      ship: ship?.kind === 'boat' ? ship : null,
      etarp: man?.kind === 'npc' ? man : null,
    }
  })

test('walking the bridge to the north island brings the pirate in', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it
  await page.evaluate(() => {
    const w = window.island.world() // the bridge the player would have salted, straight up row 20
    for (let y = 6; y <= 12; y++) w.tiles[y * w.width + 20] = 'salt'
    window.island.load({ ...w, player: { ...w.player, x: 20, y: 6, facing: 'up' } })
  })

  // hold up until he is ashore on the sand at 20,5 and the scene has cut in
  await page.keyboard.down('ArrowUp')
  await page.waitForFunction(() => window.island.world().dialogue?.key === 'pirate')
  await page.keyboard.up('ArrowUp')

  let shot = false
  for (let n = 0; n < 300; n++) {
    const on = await at(page)
    if (!on) break
    // mid-sail, with the ship a few tiles in off the east edge: the shot everyone wants
    const sailing = (await cast(page)).ship
    if (!shot && sailing && sailing.x < 29 && sailing.x > 22) {
      await page.locator('#game canvas').screenshot({ path: 'test-results/pirate.png' })
      shot = true
    }
    if (on.text !== undefined) await press(page, on.id.split('/')[1])
    else await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
  }
  expect(shot).toBe(true)

  const after = await cast(page)
  expect(after.ship).toMatchObject({ x: 21, y: 8, wrecked: true }) // stopped dead on the salt
  expect(after.etarp?.ride).toBeUndefined() // he stepped off the boat onto the bridge
  // he ends the scene behind the L of counter he built at the top of the north island, facing the
  // player's side of it, with the orb handed back and his bar open for rum
  const end = await page.evaluate(() => {
    const w = window.island.world()
    const m = w.objects.find((o) => o.id === 'etarp')
    return {
      at: [m?.x, m?.y],
      facing: m?.kind === 'npc' ? m.facing : null,
      bars: w.objects.filter((o) => o.kind === 'bar').map((o) => [o.x, o.y]),
      orb: w.inventory.orb ?? 0,
      open: w.flags['etarp:bar'],
      dialogue: w.dialogue,
    }
  })
  expect(end).toEqual({
    at: [22, 2],
    facing: 'down',
    bars: [
      [23, 2],
      [23, 3],
      [22, 3],
      [21, 3],
    ],
    orb: 1,
    open: true,
    dialogue: null,
  })

  // the ship he arrived in draws the smashed frame; the wreck the intro left behind is untouched
  const frames = await page.evaluate(() => {
    const list = window.island.game.scene.getScene('island').children.list
    const boat = (x: number) =>
      (list as Phaser.GameObjects.Sprite[]).find(
        (o) => o.texture?.key === 'sprites/boat' && o.x === x * 16,
      )?.frame.name
    return { ship: boat(21), intro: boat(12) }
  })
  expect(frames).toEqual({ ship: 1, intro: 0 })
})

// Etarp behind his bar as the scene leaves him, with the rum from the cave in the bag
test('rum across the bar buys the cocktail, spun up and stood on the counter', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()
  await page.evaluate(() => {
    const w = window.island.world()
    w.objects.push(
      { id: 'etarp', kind: 'npc', sprite: 'etarp', x: 22, y: 2, facing: 'down', dialogue: 'etarp' },
      { id: 'bar1', kind: 'bar', x: 23, y: 2 },
      { id: 'bar2', kind: 'bar', x: 23, y: 3 },
      { id: 'bar3', kind: 'bar', x: 22, y: 3 },
      { id: 'bar4', kind: 'bar', x: 21, y: 3 },
    )
    window.island.load({
      ...w,
      inventory: { orb: 1, rum: 1 },
      flags: { 'fired:pirate': true, 'etarp:bar': true, 'had:orb': true, 'had:rum': true },
      player: { ...w.player, x: 22, y: 4, facing: 'up' }, // across bar3 from him
    })
  })
  // the frame bar3 is drawn with: 1 is the cocktail stood on it
  const counter = () =>
    page.evaluate(
      () =>
        (
          window.island.game.scene.getScene('island').children.list as Phaser.GameObjects.Sprite[]
        ).find((o) => o.texture?.key === 'sprites/bar' && o.x === 22 * 16 && o.y === 4 * 16)?.frame
          .name,
    )

  // talked to across the counter: the rum goes over on his first line
  await page.keyboard.down('e')
  await page.waitForFunction(() => window.island.world().dialogue?.key === 'etarp')
  await page.keyboard.up('e')
  expect(await at(page)).toMatchObject({ id: 'etarp/rum' })
  expect(await page.evaluate(() => window.island.world().inventory.rum)).toBeUndefined()

  await press(page, 'rum') // onto the spin: the box hides while he whirls
  expect(await at(page)).toMatchObject({ id: 'etarp/spin', text: undefined })
  await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 2000 }))
  await expect.poll(async () => (await at(page))?.id).toBe('etarp/here')
  await expect.poll(counter).toBe(1)
  await page.locator('#game canvas').screenshot({ path: 'test-results/bar.png' })
  await press(page, 'here')
  expect(await at(page)).toBeNull()

  // and interact on the counter takes the drink
  await page.keyboard.down('e')
  await page.waitForFunction(() => window.island.world().inventory.otijom === 1)
  await page.keyboard.up('e')
  await expect.poll(counter).toBe(0)
})
