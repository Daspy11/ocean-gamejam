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

it.each([false, true])('only returns an orb that Etarp actually plundered: held %s', (held) => {
  let w = createWorld()
  w.inventory.orb = held ? 1 : 0
  if (held) w.objects = w.objects.filter((o) => o.id !== 'orb1')
  w.flags['had:orb'] = true
  w.dialogue = { key: 'pirate', node: '30', choice: 0 }
  const lines: string[] = []
  for (let i = 0; i < 100 && w.dialogue?.node !== '40'; i++) {
    const node = content.dialogues.pirate.nodes[w.dialogue!.node]
    if (w.typing) lines.push(w.typing.text)
    apply(w, node.text === undefined ? { type: 'tick', dt: 500 } : { type: 'interact' }, content)
    if (w.dialogue?.node === '30a') w = JSON.parse(JSON.stringify(w))
  }
  expect(lines).toContain('etarp plunders your orb')
  expect(lines.includes('you got the orb back')).toBe(held)
  expect(w.inventory.orb ?? 0).toBe(held ? 1 : 0)
  expect(w.objects.filter((o) => o.kind === 'orb')).toHaveLength(held ? 0 : 1)
  expect(w.dialogue?.node).toBe('40')
})

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

it('gets Etarp ashore when the player on the salt at 18,3 and the chest are the only way', () => {
  const w = createWorld()
  for (let y = 3; y <= 12; y++) w.tiles[tileIndex(w, 17, y)] = 'salt' // straight up the 17 column
  w.tiles[tileIndex(w, 18, 3)] = 'salt' // and one tile east to open the chest at 19,3 from
  Object.assign(w.player, { x: 18, y: 3, facing: 'right' })
  w.objects.push(
    { id: 'ship', kind: 'boat', x: 18, y: 8, wrecked: true },
    { id: 'etarp', kind: 'npc', sprite: 'etarp', dialogue: 'etarp', x: 17, y: 8, facing: 'up' },
  )
  w.dialogue = { key: 'pirate', node: '43', choice: 0 }
  apply(w, { type: 'interact' }, content) // past his line: node 44 walks him to the island's top
  apply(w, { type: 'tick', dt: 500 }, content)
  const etarp = w.objects.find((o) => o.id === 'etarp')!
  expect(etarp.path?.length).toBeGreaterThan(0) // through the player and over the chest, not stuck
  for (let i = 0; i < 100 && w.dialogue?.node === '44'; i++)
    apply(w, { type: 'tick', dt: 250 }, content)
  expect([etarp.x, etarp.y]).toEqual([23, 2])
  expect(w.dialogue?.node).toBe('47')
})
