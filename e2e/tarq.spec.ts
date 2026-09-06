import { expect, test, type Page } from '@playwright/test'

// Phaser reads the keyboard on its own frame loop, so hold each key until the world reacts
async function press(page: Page, key: string, until: (arg: string) => boolean, arg = '') {
  await page.keyboard.down(key)
  await page.waitForFunction(until, arg)
  await page.keyboard.up(key)
}

// what the box is on: an act node has no text of its own and needs ticks rather than a keypress
const at = (page: Page) =>
  page.evaluate(() => {
    const w = window.island.world()
    if (!w.dialogue) return null
    const node = window.island.content().dialogues[w.dialogue.key]?.nodes[w.dialogue.node]
    return { node: w.dialogue.node, text: node?.text ?? null }
  })

// the close-up as the ui draws it: the black over the world and the big sheet on it
const closeup = (page: Page) =>
  page.evaluate(() => {
    const list = window.island.game.scene.getScene('ui').children.list
    const black = list.find((o) => o.type === 'Rectangle') as Phaser.GameObjects.Rectangle
    const big = list.find(
      (o) => o.type === 'Image' && (o as Phaser.GameObjects.Image).scaleX > 2,
    ) as Phaser.GameObjects.Image
    return {
      black: black.visible ? black.alpha : 0,
      sheet: big.visible ? big.texture.key : null,
      frame: big.visible ? Number(big.frame.name) : null,
    }
  })

test('lord tarqualius flies in for his orb and walter gets serious', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it

  // the world the cannon leaves: Mich where the flower scene put her, Walter out at the east bridge
  await page.evaluate(() => {
    const w = window.island.world()
    const mich = w.objects.find((o) => o.id === 'mich')!
    Object.assign(mich, { x: 19, y: 15 })
    w.objects.push({
      id: 'walter',
      kind: 'npc',
      sprite: 'walter',
      x: 22,
      y: 16,
      facing: 'left',
      dialogue: 'walter',
    })
    Object.assign(w.flags, { 'score:on': true, 'fired:cannon': true })
    w.player = { ...w.player, x: 16, y: 19, facing: 'down' }
    window.island.load(w)
    window.island.dispatch({ type: 'talk', key: 'tarq' })
  })

  const lines: string[] = []
  const shown: string[] = [] // what the close-up showed at each line and act, deduplicated
  let flew: number[] | null = null
  for (let n = 0; n < 600; n++) {
    const on = await at(page)
    if (!on) break
    const seen = await closeup(page)
    const key = `${seen.black === 1 ? 'black' : 'clear'} ${seen.sheet} ${seen.frame}`
    if (shown.at(-1) !== key) shown.push(key)
    if (on.text !== null) {
      lines.push(on.text)
      // the first line is said just after the carpet has come to a stop
      flew ??= await page.evaluate(() => {
        const o = window.island.world().objects.find((x) => x.id === 'flyingcarpet1')!
        return [o.x, o.y]
      })
      await press(page, 'e', (was) => window.island.world().dialogue?.node !== was, on.node)
      continue
    }
    await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 100 }))
  }

  expect(lines).toEqual([
    'i was just gonna watch but seriously how did you mess this up so badly',
    'how are you here',
    "i didn't actually need you to smuggle that orb i just thought it would be funny",
    'rude',
    'can i have it back though',
    '...',
    'no',
    '...',
    '...',
    'give it back',
    'no',
    'pls',
    'our boat is exploded now, we gotta build a salt wall back to land',
    'cool story but give me the orb',
    "that's enough",
    "it's time",
    'to get serious',
  ])
  expect(flew).toEqual([16, 15])
  // clear until walter steps in, then black with him standing big, then his four frames in turn
  expect(shown.slice(shown.indexOf('black sprites/walter 1'))).toEqual([
    'black sprites/walter 1',
    'black sprites/serious 0',
    'black sprites/serious 1',
    'black sprites/serious 2',
    'black sprites/serious 3',
  ])
  expect(shown.filter((s) => s.startsWith('clear'))).toEqual(['clear null null'])

  const after = await page.evaluate(() => {
    const w = window.island.world()
    const where = (id: string) => {
      const o = w.objects.find((x) => x.id === id)
      return o && o.kind === 'npc' ? [o.x, o.y, o.facing, o.ride ?? null] : null
    }
    return {
      tarq: where('tarq'),
      mich: where('mich'),
      walter: where('walter'),
      open: w.dialogue,
      closeup: w.closeup,
    }
  })
  expect(after).toEqual({
    tarq: [18, 15, 'right', 'flyingcarpet1'], // two steps on from where he stopped, still aboard
    mich: [20, 15, 'left', null], // one step back, still facing him
    walter: [19, 15, 'left', null], // in between
    open: null,
    closeup: null,
  })
  expect(await closeup(page)).toEqual({ black: 0, sheet: null, frame: null })
})
