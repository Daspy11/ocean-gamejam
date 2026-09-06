import { expect, test } from '@playwright/test'

// a walk with a `to` finds its own way in the real game: Mich goes round the wreck and the crate
// to the sand south of them, and a tile she cannot reach leaves her where she is
test('a walk to a tile finds its way, and goes nowhere when there is none', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const nodes = (to: { x: number; y: number }) => ({
      walk: { walk: { id: 'mich', to }, next: 'end' },
      end: { text: '[PLACEHOLDER walked]', next: null },
    })
    const c = window.island.content()
    c.dialogues.pathTo = { name: '', start: [{ node: 'walk' }], nodes: nodes({ x: 14, y: 18 }) }
    c.dialogues.pathSea = { name: '', start: [{ node: 'walk' }], nodes: nodes({ x: 22, y: 16 }) }
    window.island.dispatch({ type: 'talk', key: 'pathTo' })
  })
  const mich = () =>
    page.evaluate(() => {
      const w = window.island.world()
      const m = w.objects.find((o) => o.id === 'mich')
      return { x: m?.x, y: m?.y, path: m?.path, node: w.dialogue?.node ?? null }
    })
  // she has a way (13,15 down the west shore, past the wreck at 12..13,16 and crate1 at 13,17)
  expect((await mich()).path?.length).toBeGreaterThan(0)
  await expect.poll(mich, { timeout: 10000 }).toEqual({ x: 14, y: 18, path: [], node: 'end' })

  await page.evaluate(() => {
    window.island.dispatch({ type: 'interact' })
    window.island.dispatch({ type: 'talk', key: 'pathSea' })
  })
  // the sea between the islands: no way there on foot, so she stays put and the line still comes
  await expect.poll(mich).toEqual({ x: 14, y: 18, path: [], node: 'end' })
})

// a walk with a `near` walks up to somebody: Mich crosses the beach to the player and turns to him
test('a walk near somebody stops on the tile before him and faces him', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.evaluate(() => {
    const c = window.island.content()
    c.dialogues.pathNear = {
      name: '',
      start: [{ node: 'walk' }],
      nodes: {
        walk: { walk: { id: 'mich', near: 'player' }, next: 'end' },
        end: { text: '[PLACEHOLDER walked]', next: null },
      },
    }
    window.island.dispatch({ type: 'talk', key: 'pathNear' })
  })
  const mich = () =>
    page.evaluate(() => {
      const w = window.island.world()
      const m = w.objects.find((o) => o.id === 'mich')
      const beside = Math.abs((m?.x ?? 0) - w.player.x) + Math.abs((m?.y ?? 0) - w.player.y)
      return {
        beside,
        facing: m?.kind === 'npc' ? m.facing : null,
        node: w.dialogue?.node ?? null,
      }
    })
  // he starts at 14,16 and Mich at 13,15, with the wreck filling 12..13,16: she comes round the
  // east side of him and looks down at him
  await expect.poll(mich, { timeout: 10000 }).toEqual({ beside: 1, facing: 'down', node: 'end' })
})
