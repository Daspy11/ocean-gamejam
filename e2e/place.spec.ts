import { expect, test } from '@playwright/test'

// the shrimp is drawn off the deck-chair sheet once flags['sprite:shrimp'] names it, and an egg
// put down out of the bag is drawn off a sheet of its own
test('an npc draws off the sheet a sprite flag names, and a placed egg off its own', async ({
  page,
}) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  const keys = () =>
    page.evaluate(() => {
      const w = window.island.world()
      const list = window.island.game.scene.getScene('island').children
        .list as Phaser.GameObjects.Sprite[]
      const at = (x: number, y: number) =>
        list.find(
          (s) => s.texture?.key.startsWith('sprites/') && s.x === x * 16 && s.y === (y + 1) * 16,
        )?.texture.key
      const shrimp = w.objects.find((o) => o.id === 'shrimp')!
      return { shrimp: at(shrimp.x, shrimp.y), egg: at(15, 14) ?? null }
    })
  expect(await keys()).toEqual({ shrimp: 'sprites/shrimp', egg: null })

  await page.evaluate(() => {
    const w = window.island.world()
    window.island.load({
      ...w,
      flags: { ...w.flags, 'sprite:shrimp': 'shrimpchair' },
      inventory: { egg: 1 },
      player: { ...w.player, x: 16, y: 14, facing: 'left' },
      menu: { screen: 'inventory', cursor: 0 },
    })
    window.island.dispatch({ type: 'interact' })
  })
  await expect.poll(keys).toEqual({ shrimp: 'sprites/shrimpchair', egg: 'sprites/egg' })
})
