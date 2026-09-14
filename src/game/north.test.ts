import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, tileIndex, type Content } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['pirate', 'got', 'note'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

it('queues Etarp behind the key pickup when the north chest is opened from salt', () => {
  const w = createWorld()
  expect(tileAt(w, 18, 3)).toBe('water')
  w.tiles[tileIndex(w, 18, 3)] = 'salt'
  Object.assign(w.player, { x: 18, y: 3, facing: 'right' })
  apply(w, { type: 'tick', dt: 50 }, content)
  expect(w.flags['fired:pirate']).toBeUndefined()
  apply(w, { type: 'interact' }, content)
  expect(w.inventory.key).toBe(1)
  expect(w.dialogue).toMatchObject({ key: 'got', item: 'key' })
  expect(w.queue).toEqual([{ key: 'pirate', item: undefined }])
  expect(w.flags['fired:pirate']).toBe(true)
  apply(w, { type: 'interact' }, content)
  expect(w.dialogue).toMatchObject({ key: 'pirate', node: '1' })
  expect(w.rumble).toBe(w.time + 2000)

  w.dialogue = null // the arrival has finished; opening again and landing cannot repeat it
  apply(w, { type: 'interact' }, content)
  Object.assign(w.player, { x: 20, y: 6, step: { x: 20, y: 5, t: 0 } })
  apply(w, { type: 'tick', dt: 217 }, content)
  expect(w.dialogue).toBeNull()
  expect(w.queue).toEqual([])
})

it('does not repeat Etarp when the player landed before opening the north chest', () => {
  const w = createWorld()
  Object.assign(w.player, { x: 20, y: 6, step: { x: 20, y: 5, t: 0 } })
  apply(w, { type: 'tick', dt: 217 }, content)
  expect(w.flags['fired:pirate']).toBe(true)
  w.dialogue = null
  Object.assign(w.player, { x: 19, y: 4, facing: 'up', step: null })
  apply(w, { type: 'interact' }, content)
  expect(w.inventory.key).toBe(1)
  expect(w.queue).toEqual([])
  apply(w, { type: 'interact' }, content)
  expect(w.dialogue).toBeNull()
})

it.each(['crate2', 'crate3', 'crate5'])('opening %s does not summon Etarp', (id) => {
  const w = createWorld()
  const chest = w.objects.find((o) => o.id === id)!
  Object.assign(w.player, { x: chest.x, y: chest.y + 1, facing: 'up' })
  apply(w, { type: 'interact' }, content)
  expect(w.dialogue?.key).toBe(id === 'crate3' ? 'note' : 'got')
  expect(w.flags['fired:pirate']).toBeUndefined()
  expect(w.queue).toEqual([])
})
