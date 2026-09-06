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

// what the box is on: an act node has no text of its own and needs ticks rather than a keypress
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return { node: w.dialogue.node, text: node?.text ?? null, choices: node?.choices?.length ?? 0 }
  })

test('fifteen beauty brings the sea horse up, and his prototype takes the island with it', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it

  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({ ...w, score: 15, flags: { ...w.flags, 'score:on': true } })
  })
  await page.waitForFunction(() => window.island.world().dialogue?.key === 'seahorse')

  // play the scene out: ticks through the acts, a keypress through every line, stop at the choice
  const lines: string[] = []
  let placed: { x: number; y: number } | null = null
  for (let n = 0; n < 200; n++) {
    const on = await at(page)
    if (!on) break
    if (on.text === null) {
      await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 1000 }))
      continue
    }
    lines.push(on.text)
    if (on.choices) break
    placed ??= await page.evaluate(() => {
      const m = window.island.world().objects.find((o) => o.kind === 'machine')
      return m ? { x: m.x, y: m.y } : null
    })
    await press(page, 'e', (was) => window.island.world().dialogue?.node !== was, on.node)
  }

  expect(lines[0]).toBe('FIFTEEN BEAUTY???')
  expect(lines).toContain('this is my prototype of desalinator 9000')
  expect(lines.at(-1)).toBe('oh, um, would you like me to fix that')
  expect(placed).toEqual({ x: 16, y: 20 }) // his left at 15,21 is sea, so it lands one up the spit
  await expect.poll(() => texts(page)).toContain('> yes') // the box is a frame behind the world
  await press(page, 'ArrowDown', () => window.island.world().dialogue?.choice === 1)
  await expect.poll(() => texts(page)).toContain('> no')

  const after = await page.evaluate(() => {
    const w = window.island.world()
    const him = w.objects.find((o) => o.id === 'seahorse')
    return {
      ashore: [him?.x, him?.y],
      running: w.objects.some((o) => o.kind === 'machine'),
      blast: w.tiles[23 * w.width + 16],
      spared: w.tiles[20 * w.width + 24], // just outside the seven-tile disc
      score: w.score,
    }
  })
  expect(after).toEqual({
    ashore: [16, 21],
    running: false,
    blast: 'salt',
    spared: 'water',
    score: after.score,
  })
  expect(after.score).toBeLessThan(0)
  // the whole scene happens down at the spit, wherever the player was left: look at it for the shot
  await page.evaluate(() => {
    const cam = window.island.game.scene.getScene('island').cameras.main
    cam.stopFollow()
    cam.centerOn(16 * 16 + 8, 20 * 16 + 8)
  })
  await page.waitForTimeout(200)
  await page.locator('#game canvas').screenshot({ path: 'test-results/seahorse.png' })
})
