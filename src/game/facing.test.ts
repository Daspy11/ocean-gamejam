import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import { startAct } from './act'
import { apply } from './actions'
import { createWorld, npc, type Content, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    readdirSync(new URL('../../assets/dialogue/', import.meta.url)).map((file) => [
      file.replace('.json', ''),
      JSON.parse(readFileSync(new URL(`../../assets/dialogue/${file}`, import.meta.url), 'utf8')),
    ]),
  ),
  items: {},
}

function line(w: World, key: string, node: string) {
  w.dialogue = { key, node, choice: 0 }
  startAct(w, w.dialogue, content.dialogues[key].nodes[node], content)
}

it.each([
  [21, 20, 'right', 'left'],
  [19, 20, 'left', 'right'],
  [20, 21, 'down', 'up'],
  [20, 19, 'up', 'down'],
] as const)('Mich faces the electrolytes holder at %i,%i', (x, y, her, him) => {
  const w = createWorld()
  const mich = w.objects.find((o) => o.id === 'mich')!
  Object.assign(mich, { x: 20, y: 20, facing: 'down' })
  Object.assign(w.player, { x, y, facing: 'down' })
  line(w, 'flower', 'a1')
  expect(mich).toMatchObject({ facing: her })
  expect(w.player.facing).toBe(him)
})

it('turns the player when Etarp finishes approaching and starts talking', () => {
  const w = createWorld()
  Object.assign(w.player, { x: 18, y: 15, facing: 'up' })
  w.objects.push(npc('etarp', 'etarp', 19, 15, 'down', 'etarp'))
  line(w, 'pirate', '8')
  apply(w, { type: 'tick', dt: 50 }, content)
  expect(w.dialogue?.node).toBe('9')
  expect(w.player.facing).toBe('right')
  expect(w.objects.find((o) => o.id === 'etarp')).toMatchObject({ facing: 'left' })
})

it.each([
  ['flower', '19', 'mich', 'right'],
  ['flower', '20', 'walter', 'left'],
  ['flower', '32', 'walter', 'left'],
  ['pirate', '18', 'mich', 'left'],
  ['pirate', '24', 'etarp', 'right'],
  ['seahorse', '4', 'walter', 'left'],
  ['seahorse', '6', 'mich', 'right'],
  ['seahorse', '20', 'mich', 'left'],
  ['cannon', '6', 'seahorse', 'right'],
  ['cannon', '7', 'etarp', 'left'],
  ['cannon', '8b', 'walter', 'left'],
  ['tarq', '5', 'tarq', 'down'],
  ['tarq', '6', 'mich', 'up'],
  ['tarq', 'out6', 'mich', 'down'],
  ['tarq', 'ask', 'walter', 'left'],
  ['tarq', 'bye2', 'mich', 'right'],
  ['tarq', 'yarr', 'etarp', 'left'],
  ['treealive', 'sun2', 'mich', 'right'],
  ['inventory1', '1', 'mich', 'down'],
  ['albatross', '1', 'albatross', 'left'],
  ['shrimp', '1', 'shrimp', 'up'],
] as const)('%s:%s addresses the right person', (key, node, speaker, facing) => {
  const w = createWorld()
  Object.assign(w.player, { x: 20, y: 20, facing: 'up' })
  w.objects = [
    npc('mich', 'mich', 20, 18, 'down', 'mich'),
    npc('walter', 'walter', 22, 18, 'down', 'walter'),
    npc('etarp', 'etarp', 18, 20, 'down', 'etarp'),
    npc('seahorse', 'seahorse', 16, 18, 'down', 'seahorse'),
    npc('tarq', 'tarq', 20, 16, 'right', 'tarq'),
    npc('albatross', 'albatross', 24, 20, 'down', 'albatross'),
    npc('shrimp', 'shrimp', 20, 24, 'down', 'shrimp'),
  ]
  line(w, key, node)
  expect(w.objects.find((o) => o.id === speaker)).toMatchObject({ facing })
})

it('keeps explicit glances and narration, and does not turn an unconscious Tarq', () => {
  const w = createWorld()
  const mich = w.objects.find((o) => o.id === 'mich')!
  line(w, 'landing', '3')
  line(w, 'landing', '4')
  expect(mich).toMatchObject({ facing: 'up' })
  line(w, 'landing', '5')
  expect(mich).toMatchObject({ facing: 'right' })
  const before = structuredClone(w.player)
  line(w, 'got', '1')
  expect(w.player).toEqual(before)
  const tarq = { ...npc('tarq', 'tarq', 13, 16, 'left', 'tarq'), flat: true }
  w.objects.push(tarq)
  line(w, 'tarq', 'out3')
  expect(mich).toMatchObject({ facing: 'up' })
  expect(tarq).toMatchObject({ facing: 'left' })
})

it('lets Mich inspect the flower and Etarp inspect his wreck', () => {
  const w = createWorld()
  const mich = w.objects.find((o) => o.id === 'mich')!
  Object.assign(mich, { x: 18, y: 15 })
  w.objects.push({ id: 'flower1', kind: 'flower', x: 18, y: 14 })
  line(w, 'flower', '12')
  expect(mich).toMatchObject({ facing: 'up' })
  w.objects.push(npc('etarp', 'etarp', 19, 15, 'down', 'etarp'))
  w.objects.push({ id: 'ship', kind: 'boat', x: 20, y: 15, wrecked: true })
  line(w, 'pirate', '33')
  expect(w.objects.find((o) => o.id === 'etarp')).toMatchObject({ facing: 'right' })
})
