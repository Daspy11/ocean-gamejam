import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { tileIndex, createWorld, tileAt, type Content, type Obj, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['mimic', 'got', 'flower'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

function arrive() {
  const w = createWorld()
  for (let x = 20; x < 32; x++)
    if (tileAt(w, x, 17) === 'water') w.tiles[tileIndex(w, x, 17)] = 'salt'
  Object.assign(w.player, {
    x: 31,
    y: 17,
    facing: 'right',
    held: 'right',
    step: { x: 32, y: 17, t: 0 },
  })
  return w
}

function until(w: World, key: string, node: string) {
  for (let i = 0; i < 600 && (w.dialogue?.key !== key || w.dialogue?.node !== node); i++)
    apply(w, { type: 'tick', dt: 50 }, content)
  expect(w.dialogue).toMatchObject({ key, node })
}

describe('the overlooked chest', () => {
  it.each([0, 1])(
    'approaches, gives its loot for yes %i, thanks and returns before Mich’s scene',
    (choice) => {
      const w = arrive()
      const chest = w.objects.find((o) => o.id === 'crate2') as Obj & { kind: 'crate' }
      apply(w, { type: 'tick', dt: 217 }, content)
      expect(w.dialogue).toMatchObject({ key: 'mimic', node: 'approach' })
      expect(w.player.step).toBeNull()
      until(w, 'mimic', 'rude')
      expect(Math.abs(chest.x - w.player.x) + Math.abs(chest.y - w.player.y)).toBe(1)
      expect([chest.x, chest.y]).not.toEqual([24, 17])
      for (const text of [
        'kind of rude to come to my island and not even open me',
        'what',
        'what? you never seen a mimic before?',
        'does this mean we fight now',
      ]) {
        expect(content.dialogues.mimic.nodes[w.dialogue!.node].text).toBe(text)
        apply(w, { type: 'interact' }, content)
      }
      expect(content.dialogues.mimic.nodes[w.dialogue!.node].choices?.map((c) => c.text)).toEqual([
        'yes',
        'yes',
      ])
      if (choice) apply(w, { type: 'move', dir: 'down' }, content)
      apply(w, { type: 'interact' }, content)
      expect(chest.open).toBe(true)
      expect(w.inventory.electrolytes).toBe(1)
      until(w, 'got', '1')
      expect(w.dialogue?.item).toBe('electrolytes')
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue).toMatchObject({ key: 'mimic', node: 'wait' })
      apply(w, { type: 'tick', dt: 499 }, content)
      expect(w.dialogue?.node).toBe('wait')
      apply(w, { type: 'tick', dt: 1 }, content)
      expect(w.dialogue?.node).toBe('thanks')
      apply(w, { type: 'interact' }, content)
      expect(chest.step).toBeTruthy()
      until(w, 'flower', 'run')
      expect(chest).toMatchObject({ x: 24, y: 17, open: true })
      expect(chest.step).toBeNull()
      w.dialogue = null
      w.queue = []
      Object.assign(w.player, { x: 24, y: 18, facing: 'up', held: null })
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue).toMatchObject({ key: 'mimic', node: 'undercover' })
      expect(w.inventory.electrolytes).toBe(1)
    },
  )

  it('leaves a normally opened chest silent and never starts its encounter', () => {
    const w = arrive()
    Object.assign(w.player, { x: 24, y: 18, facing: 'up', held: null, step: null })
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.electrolytes).toBe(1)
    w.dialogue = null
    w.queue = []
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBeNull()
    Object.assign(w.player, { x: 31, y: 17, step: { x: 32, y: 17, t: 0 } })
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.flags['fired:mimic']).toBeUndefined()
    expect(w.dialogue).toBeNull()
  })

  it('does not trigger on the bridge or the small island', () => {
    const w = arrive()
    Object.assign(w.player, { x: 28, y: 17, held: null, step: { x: 29, y: 17, t: 0 } })
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.dialogue).toBeNull()
    Object.assign(w.player, { x: 25, y: 17, step: { x: 26, y: 17, t: 0 } })
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.dialogue).toBeNull()
  })
})
