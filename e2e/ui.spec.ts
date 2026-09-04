import { expect, test } from '@playwright/test'

// UI.ts geometry: the box sits at 8,240 and its 8px nine-slice frame leaves 248..344 inside, so the
// name line is at 248 and the body gets the five 16px lines from 264 down.
const BODY = 264
const FLOOR = 344

test('the boxes are the ui/box nine-slice and the baked font is 1-bit', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('ui'))

  const drawn = await page.evaluate(() => {
    const list = window.island.game.scene.getScene('ui').children.list
    // any pixel that is neither clear nor solid means the ttf got smeared into the sheet
    const src = window.island.game.textures.get('ui/font').getSourceImage() as HTMLCanvasElement
    const read = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
    let blurred = 0
    for (let i = 3; i < read.length; i += 4) if (read[i] !== 0 && read[i] !== 255) blurred++
    return {
      boxes: list
        .filter((o) => o.type === 'NineSlice')
        .map((o) => {
          const box = o as Phaser.GameObjects.NineSlice
          return [box.texture.key, box.width, box.height]
        }),
      // every label is a BitmapText blitted from that sheet, so nothing goes through Canvas2D text
      labels: [...new Set(list.filter((o) => o.type === 'BitmapText').map(() => 'basis33'))],
      texts: list.filter((o) => o.type === 'Text').length,
      blurred,
    }
  })
  expect(drawn).toEqual({
    boxes: [
      ['ui/box', 624, 112], // the dialogue box
      ['ui/box', 184, 144], // the inventory panel
    ],
    labels: ['basis33'],
    texts: 0,
    blurred: 0,
  })
})

test('every dialogue node fits the box', async ({ page }) => {
  await page.goto('/?scene=island')
  await page.waitForFunction(() => window.island?.game.scene.isActive('ui'))

  // measure with the same font and wrap width UI.ts uses, so a line too long for the box is a fail
  const overflowing = await page.evaluate(
    ([top, floor]) => {
      const scene = window.island.game.scene.getScene('ui')
      const probe = scene.add.bitmapText(20, top, 'basis33', '').setMaxWidth(604)
      const content = window.island.content()
      // {item} is filled in at draw time, so measure the node with the longest name it could get
      const longest = Object.values(content.items).reduce(
        (a, b) => (b && b.name.length > a.length ? b.name : a),
        '',
      )
      const over: string[] = []
      for (const [key, dialogue] of Object.entries(content.dialogues))
        for (const [id, node] of Object.entries(dialogue.nodes)) {
          if (node.text === undefined) continue
          const lines = node.choices ? node.choices.map((c) => `> ${c.text}`) : ['[E] continue']
          probe.setText([node.text.replaceAll('{item}', longest), '', ...lines].join('\n'))
          if (top + probe.height > floor) over.push(`${key}:${id} is ${probe.height}px`)
        }
      probe.destroy()
      return over
    },
    [BODY, FLOOR],
  )
  expect(overflowing).toEqual([])
})

// a fractional scale makes the browser draw some game pixels wider than others, which reads as a
// lumpy font; main.ts letterboxes instead, so these windows all land on a whole multiple of 640x360
test('the canvas only ever scales by a whole number', async ({ page }) => {
  for (const [w, h, zoom] of [
    [1400, 800, 2], // 2.1875 if it stretched to fit
    [1920, 1080, 3],
    [900, 620, 1], // 1.40: too small to double, so it stays at 1:1 rather than going uneven
  ]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?scene=island')
    await page.waitForFunction(() => window.island?.game.scene.isActive('ui'))
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector('#game canvas') as HTMLCanvasElement
      const box = canvas.getBoundingClientRect()
      return [box.width / canvas.width, box.height / canvas.height]
    })
    expect(drawn).toEqual([zoom, zoom])
  }
})
