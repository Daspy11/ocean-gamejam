import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop and a Key that goes down and up inside one frame
// is never seen, so every key the menu itself reads has to be held for a few frames.
async function tap(page: Page, key: string) {
  await page.keyboard.down(key)
  await page.waitForTimeout(80)
  await page.keyboard.up(key)
  await page.waitForTimeout(80)
}

const open = (page: Page) => page.evaluate(() => window.island.game.scene.isActive('debug'))
const island = (page: Page) =>
  page.evaluate(() => ({
    active: window.island.game.scene.isActive('island'),
    paused: window.island.game.scene.isPaused('island'),
  }))
const menu = (page: Page) =>
  page.evaluate(() =>
    window.island.game.scene
      .getScene('debug')
      .children.list.map((o) => (o as Phaser.GameObjects.BitmapText).text ?? '')
      .join('\n'),
  )

// the cursor starts on 'gallery', so `by` steps down onto the story beat below it and runs that one
async function beat(page: Page, by: number, label: string) {
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  for (let i = 0; i < by; i++) await tap(page, 'ArrowDown')
  expect(await menu(page)).toContain(`> ${label}`)
  await tap(page, 'e')
  await expect.poll(() => open(page)).toBe(false) // running an option closes the menu behind it
}

// the dev menu behind Z-Z-Z: it never ships, and it is the only way to play a late beat at once
test('the debug menu opens on Z three times and jumps the game to a story beat', async ({
  page,
}) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  // ScenePlugin.pause queues the op for the next step, so poll rather than read it once. A paused
  // scene is not an active one: island stops stepping, so nothing walks behind the panel.
  await expect.poll(() => island(page)).toEqual({ active: false, paused: true })
  await tap(page, 'ArrowDown')
  await tap(page, 'ArrowDown')
  expect(await menu(page)).toContain('> the orb')

  await tap(page, 'e')
  await expect.poll(() => open(page)).toBe(false)
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
  // the whole world is rebuilt at that beat: the crate is open, the orb is in the bag under the
  // name both inventory beats leave it with, and none of their boxes play again
  expect(
    await page.evaluate(() => {
      const w = window.island.world()
      const crate = w.objects.find((o) => o.id === 'crate1')
      return {
        open: crate?.kind === 'crate' && crate.open,
        bag: w.inventory,
        name: w.flags['name:orb'],
        dialogue: w.dialogue,
      }
    }),
  ).toEqual({ open: true, bag: { orb: 1 }, name: 'fire orb', dialogue: null })

  // and Escape closes it again without running anything
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  await tap(page, 'Escape')
  await expect.poll(() => open(page)).toBe(false)
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
  expect(await page.evaluate(() => window.island.world().inventory)).toEqual({ orb: 1 })

  // Z three more times shuts it from main.ts, and the island has to come back from that too
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await page.waitForFunction(() => window.island.game.scene.isActive('debug'))
  await page.waitForTimeout(1100) // let the press counter age out, so the next three are fresh
  for (let i = 0; i < 3; i++) await page.keyboard.press('z')
  await expect.poll(() => open(page)).toBe(false)
  await expect.poll(() => island(page)).toEqual({ active: true, paused: false })
})

test('the later beats hand over the bag and the score the story has by then', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  await beat(page, 3, 'beauty is on')
  expect(
    await page.evaluate(() => {
      const w = window.island.world()
      return {
        score: w.score,
        on: w.flags['score:on'],
        bag: w.inventory,
        walter: w.objects.some((o) => o.id === 'walter'),
        flower: w.objects.some((o) => o.id === 'flower1'),
      }
    }),
  ).toEqual({ score: 10, on: true, bag: { orb: 1, carpet: 1 }, walter: true, flower: true })

  await beat(page, 4, 'ten twigs for the albatross')
  expect(await page.evaluate(() => window.island.world().inventory.twig)).toBe(10)
  expect(await page.evaluate(() => window.island.world().player)).toMatchObject({ x: 36, y: 21 })

  // fifteen beauty is the sea horse's cue: the scene starts itself on the very next tick
  await beat(page, 5, 'fifteen beauty')
  await expect.poll(() => page.evaluate(() => window.island.world().dialogue?.key)).toBe('seahorse')
  // with Etarp and the bridge to the north island already there for that scene to use
  expect(
    await page.evaluate(() => {
      const w = window.island.world()
      return { etarp: w.objects.some((o) => o.id === 'etarp'), bridge: w.tiles[9 * w.width + 20] }
    }),
  ).toEqual({ etarp: true, bridge: 'salt' })
})

// a jump is a way out of a scene that has gone wrong, so it has to take the scene with it
test('jumping to a beat drops the cutscene that was playing', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click()

  // flower.json opens on a walk act: the box is hidden, mich is running, and input cannot skip it
  await page.evaluate(() => {
    const w = window.island.world()
    w.tiles[16 * w.width + 21] = w.tiles[16 * w.width + 22] = 'salt' // the bridge she runs over
    window.island.load(w)
    window.island.dispatch({ type: 'talk', key: 'flower' })
  })
  await expect.poll(() => page.evaluate(() => window.island.world().dialogue?.key)).toBe('flower')
  await expect
    .poll(() =>
      page.evaluate(() => window.island.world().objects.find((o) => o.id === 'mich')?.step),
    )
    .not.toBe(null)

  await beat(page, 1, 'the beginning')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window.island.world()
        const mich = w.objects.find((o) => o.id === 'mich')
        return { dialogue: w.dialogue, queue: w.queue, step: mich?.step ?? null, path: mich?.path }
      }),
    )
    .toEqual({ dialogue: null, queue: [], step: null, path: undefined })
})
