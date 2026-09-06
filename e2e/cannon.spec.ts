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
    return { key: w.dialogue.key, node: w.dialogue.node, text: node?.text ?? null }
  })

test('etarp shoves his cannon ashore and shells the island, and the sea horse walls off his half', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('island'))
  await page.locator('#game canvas').click() // focus first: a click on an open box advances it

  // the world the sea horse's scene leaves behind: his bridge north, Etarp behind his bar, the sea
  // horse ashore on the spit, and the crust his prototype left seven tiles round the spit
  await page.evaluate(() => {
    const w = window.island.world()
    for (let y = 6; y <= 13; y++) w.tiles[y * w.width + 20] = 'salt'
    for (let y = 13; y <= 27; y++)
      for (let x = 9; x <= 23; x++) {
        const i = y * w.width + x
        if ((x - 16) ** 2 + (y - 20) ** 2 > 49 || w.tiles[i] !== 'water') continue
        w.tiles[i] = 'salt'
        w.main[i] = true
      }
    w.objects.push(
      { id: 'ship', kind: 'boat', x: 21, y: 8, wrecked: true },
      { id: 'bar1', kind: 'bar', x: 23, y: 2 },
      { id: 'bar2', kind: 'bar', x: 23, y: 3 },
      { id: 'bar3', kind: 'bar', x: 22, y: 3 },
      { id: 'bar4', kind: 'bar', x: 21, y: 3 },
      { id: 'etarp', kind: 'npc', sprite: 'etarp', x: 22, y: 2, facing: 'down', dialogue: 'etarp' },
      {
        id: 'walter',
        kind: 'npc',
        sprite: 'walter',
        x: 17,
        y: 16,
        facing: 'left',
        dialogue: 'walter',
      },
      {
        id: 'seahorse',
        kind: 'npc',
        sprite: 'seahorse',
        x: 16,
        y: 21,
        facing: 'up',
        dialogue: 'seahorse',
      },
    )
    // the charring takes beauty below zero, and the line on that is dead once the sea horse is met
    Object.assign(w.flags, { 'score:on': true, 'seahorse:met': true, 'fired:seahorse': true })
    w.score = 15
    w.player = { ...w.player, x: 16, y: 19, facing: 'down' }
    window.island.load(w)
    window.island.dispatch({ type: 'talk', key: 'cannon' })
  })
  // play it out: ticks through the acts, a keypress through each line
  const lines: string[] = []
  let glowed = false
  let arrived: number[][] | null = null
  for (let n = 0; n < 600; n++) {
    const on = await at(page)
    if (!on || on.key !== 'cannon') break // Tarq's scene follows on from this one's close
    if (on.text !== null) {
      lines.push(on.text)
      // the first line is said stood just under the strip at the top, the cannon under him
      arrived ??= await page.evaluate(() =>
        ['etarp', 'cannon'].map((id) => {
          const o = window.island.world().objects.find((x) => x.id === id)!
          return [o.x, o.y]
        }),
      )
      await press(page, 'e', (was) => window.island.world().dialogue?.node !== was, on.node)
      continue
    }
    await page.evaluate(() => window.island.dispatch({ type: 'tick', dt: 200 }))
    // a ball in the air is drawn glowing somewhere between red and white
    glowed ||= await page.evaluate(() => {
      const list = window.island.game.scene.getScene('island').children.list
      return (list as Phaser.GameObjects.Sprite[]).some(
        (o) => o.texture?.key === 'sprites/ball' && o.isTinted && o.tintTopLeft !== 0xffffff,
      )
    })
  }

  expect(lines).toEqual([
    "YARR, DON'T LET THAT SEA HORSE NEAR THIS ISLAND.",
    'oh hi again lol your name is backwards',
    '...',
    'is that one of my autocannon 9000s',
    'yes',
    'lol you missed',
    "but FINE you can have that part of the island and i'll have this part",
  ])
  expect(arrived).toEqual([
    [16, 14],
    [16, 15],
  ])
  expect(glowed).toBe(true)

  const after = await page.evaluate(() => {
    const w = window.island.world()
    const spared = ['npc', 'cannon', 'ball', 'cinder', 'orb', 'cave', 'machine']
    const where = (id: string) => {
      const o = w.objects.find((x) => x.id === id)
      return o ? [o.x, o.y] : null
    }
    let green = 0
    let charred = 0
    for (let i = 0; i < w.tiles.length; i++) {
      if (w.tiles[i] === 'charred') charred++
      if (w.main[i] && w.tiles[i] === 'grass') green++
    }
    return {
      walter: where('walter'),
      seahorse: where('seahorse'),
      next: w.dialogue?.key ?? null,
      standing: w.objects.filter((o) => !spared.includes(o.kind) && w.main[o.y * w.width + o.x])
        .length,
      wrecked: ['boat1', 'crate1', 'tree1'].filter((id) => w.objects.some((o) => o.id === id)),
      mich: where('mich'),
      green,
      charred,
      wall: w.objects.filter((o) => o.kind === 'cinder').map((o) => [o.x, o.y]),
      machines: w.objects.filter((o) => o.kind === 'machine').length,
      score: w.score,
    }
  })
  expect(after).toMatchObject({
    walter: [22, 16], // out in the water on the way to the second island
    seahorse: [16, 25], // south of his wall, on his part
    next: 'tarq', // waiting his five seconds
    standing: 0,
    wrecked: [], // the hull, the chest and the tree that stood on the island are all gone
    mich: [13, 15], // the cast is never hit
    green: 8, // the strip and the row he stands on, above the muzzle, are the only grass left
    charred: 26, // every grass tile from the cannon's row down, 3 beauty each
    wall: Array.from({ length: 13 }, (_, i) => [10 + i, 22]),
    machines: 4,
  })
  expect(after.score).toBeLessThanOrEqual(15 - 26 * 3 - 13 * 10) // and the machines eat on

  await page.evaluate(() => {
    const cam = window.island.game.scene.getScene('island').cameras.main
    cam.stopFollow()
    cam.centerOn(16 * 16 + 8, 19 * 16 + 8)
  })
  await page.waitForTimeout(200)
  await page.locator('#game canvas').screenshot({ path: 'test-results/cannon.png' })
})
