import { expect, test, type Page } from '@playwright/test'

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
  for (let n = 0; n < 200; n++) {
    const on = await at(page)
    if (!on) break
    // mid-sail, with the ship a few tiles in off the east edge: the shot everyone wants
    const sailing = (await cast(page)).ship
    if (!shot && sailing && sailing.x < 29 && sailing.x > 22) {
      await page.locator('#game canvas').screenshot({ path: 'test-results/pirate.png' })
      shot = true
    }
    if (on.text !== undefined) await page.keyboard.press('e')
    else await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 250 }))
  }
  expect(shot).toBe(true)

  const after = await cast(page)
  expect(after.ship).toMatchObject({ x: 21, y: 8, wrecked: true }) // stopped dead on the salt
  expect(after.etarp).toMatchObject({ x: 20, y: 8, facing: 'left' })
  expect(after.etarp?.ride).toBeUndefined() // he stepped off the boat onto the bridge
  expect(await page.evaluate(() => window.island.world().dialogue)).toBe(null)

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
