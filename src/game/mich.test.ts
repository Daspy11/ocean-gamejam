import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileIndex, type Content, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['mich', 'albatross', 'shrimp', 'sign'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

function exploring(): World {
  const w = createWorld()
  w.objects = w.objects.filter((o) => o.id !== 'orb1')
  w.inventory.orb = 1
  w.flags = { 'had:orb': true, 'fired:firstsalt': true, 'had:electrolytes': true, 'score:on': true }
  return w
}

function hint(w: World): string | undefined {
  w.dialogue = null
  Object.assign(w.player, { x: 14, y: 17, facing: 'left', step: null })
  apply(w, { type: 'interact' }, content)
  expect(w.dialogue).toMatchObject({ key: 'mich' })
  expect(w.typing?.text).toBe(content.dialogues.mich.nodes[w.dialogue!.node].text)
  return w.dialogue!.node
}

describe('Mich points to an outstanding task', () => {
  it('follows collecting, throwing and retrieving the orb, then the eastern chest', () => {
    const w = createWorld()
    expect(hint(w)).toBe('1')
    w.dialogue = null
    Object.assign(w.player, { x: 14, y: 15, facing: 'left' })
    apply(w, { type: 'interact' }, content)
    expect(hint(w)).toBe('3')
    w.dialogue = null
    Object.assign(w.player, { x: 14, y: 13, facing: 'left' })
    apply(w, { type: 'interact' }, content)
    expect(hint(w)).toBe('6') // no separate hint while the orb boils
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(hint(w)).toBe('5')
    w.dialogue = null
    Object.assign(w.player, { x: 14, y: 13, facing: 'left' })
    apply(w, { type: 'interact' }, content)
    w.flags['fired:firstsalt'] = true
    expect(hint(w)).toBe('6')
  })

  const cases: [string, string, (w: World) => void][] = [
    [
      'carpet in the bag',
      '7',
      (w) => {
        w.inventory.carpet = 1
      },
    ],
    ['general exploring', '8', () => {}],
    [
      'bird asked for more twigs',
      '10',
      (w) => {
        w.flags['talked:albatross'] = true
        w.inventory.twig = 9
      },
    ],
    [
      'enough twigs even before meeting the bird',
      '11',
      (w) => {
        w.inventory.twig = 10
      },
    ],
    [
      'egg in the bag',
      '12',
      (w) => {
        w.inventory.egg = 1
      },
    ],
    [
      'big island reached, shrimp not asked',
      '13',
      (w) => {
        w.flags['arrived:big'] = true
      },
    ],
    [
      'eleven carrots',
      '14',
      (w) => {
        w.flags['shrimp:asked'] = true
        w.inventory.carrot = 11
      },
    ],
    [
      'twelve carrots',
      '15',
      (w) => {
        w.flags['shrimp:asked'] = true
        w.inventory.carrot = 12
      },
    ],
    [
      'chair requested, Harry not asked',
      '16',
      (w) => {
        w.flags['shrimp:chair'] = true
      },
    ],
    [
      'cocktail needed, pirate undiscovered',
      '17',
      (w) => {
        w.flags['harry:asked'] = true
      },
    ],
    [
      'north reached, chest unopened',
      '18',
      (w) => {
        w.flags['fired:pirate'] = true
      },
    ],
    [
      'key held, gate still locked',
      '19',
      (w) => {
        w.inventory.key = 1
      },
    ],
    [
      'rum for the bar',
      '21',
      (w) => {
        w.flags['etarp:bar'] = true
        w.inventory.rum = 1
      },
    ],
    [
      'cocktail left on the counter',
      '22',
      (w) => {
        w.objects.push({ id: 'bar3', kind: 'bar', x: 22, y: 3, drink: true })
      },
    ],
    [
      'cocktail for Harry',
      '23',
      (w) => {
        w.inventory.otijom = 1
      },
    ],
    [
      'chairs unlocked',
      '24',
      (w) => {
        w.flags['harry:ok'] = true
      },
    ],
    [
      'certificate in the bag',
      '26',
      (w) => {
        w.inventory.certificate = 1
      },
    ],
  ]

  it.each(cases)('%s', (_name, expected, setup) => {
    const w = exploring()
    setup(w)
    expect(hint(w)).toBe(expected)
  })

  it('prioritises ready trades over decorating and collection', () => {
    const w = exploring()
    Object.assign(w.inventory, { twig: 10, carpet: 1, egg: 1, certificate: 1 })
    w.flags['shrimp:asked'] = true
    expect(hint(w)).toBe('11')
    w.flags['albatross:egg'] = true
    w.inventory.carrot = 12
    expect(hint(w)).toBe('15')
    w.flags['shrimp:chair'] = true
    w.inventory.otijom = 1
    expect(hint(w)).toBe('23')
    w.flags['harry:ok'] = true
    expect(hint(w)).toBe('26')
  })

  it('does not repeat completed or unavailable tasks', () => {
    const w = exploring()
    Object.assign(w.flags, {
      'talked:albatross': true,
      'albatross:egg': true,
      'shrimp:asked': true,
      'shrimp:chair': true,
      'shrimp:thanked': true,
      'harry:asked': true,
      'harry:ok': true,
      'etarp:bar': true,
      'etarp:served': true,
      'had:key': true,
    })
    Object.assign(w.inventory, { twig: 12, carrot: 12, rum: 1, otijom: 1 })
    expect(hint(w)).toBe('8')
    delete w.flags['albatross:egg']
    delete w.inventory.twig
    w.flags['tree:promised'] = true
    expect(hint(w)).toBe('8')
    delete w.flags['tree:promised']
    w.objects = w.objects.filter((o) => o.id !== 'tree1')
    expect(hint(w)).toBe('8')
  })

  it('skips the ignored chair hand-in and rum collection situations', () => {
    const w = exploring()
    Object.assign(w.flags, { 'shrimp:asked': true, 'shrimp:chair': true, 'harry:ok': true })
    w.inventory.chair = 1
    expect(hint(w)).toBe('8')
    delete w.inventory.chair
    w.flags['shrimp:thanked'] = true
    w.flags['etarp:bar'] = true
    w.flags['had:key'] = true
    w.objects = w.objects.filter((o) => o.kind !== 'gate')
    expect(hint(w)).toBe('8')
  })

  it('does not send the player back to the sign after reading it', () => {
    const w = exploring()
    w.flags['harry:asked'] = true
    expect(hint(w)).toBe('17')
    w.dialogue = null
    apply(w, { type: 'talk', key: 'sign' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.flags['talked:sign']).toBe(true)
    expect(hint(w)).toBe('8')
  })

  it('remembers the bird request after its actual conversation and a save round trip', () => {
    const w = exploring()
    apply(w, { type: 'talk', key: 'albatross' }, content)
    for (let i = 0; i < 10 && w.dialogue; i++) apply(w, { type: 'interact' }, content)
    expect(w.flags['talked:albatross']).toBe(true)
    expect(hint(JSON.parse(JSON.stringify(w)))).toBe('10')
  })

  it('records arrival even when the mimic was bypassed by opening its chest', () => {
    const w = exploring()
    Object.assign(w.player, { x: 31, y: 16, facing: 'right', step: { x: 32, y: 16, t: 0.99 } })
    w.tiles[tileIndex(w, 32, 16)] = 'sand'
    apply(w, { type: 'tick', dt: 10 }, content)
    expect(w.flags['arrived:big']).toBe(true)
    expect(hint(w)).toBe('13')
  })

  it('keeps authored lines repeatable without changing inventory or opening quests', () => {
    const w = exploring()
    w.inventory.egg = 1
    const before = structuredClone(w.inventory)
    expect(hint(w)).toBe('12')
    apply(w, { type: 'interact' }, content)
    expect(hint(w)).toBe('12')
    expect(w.inventory).toEqual(before)
    expect(w.flags['fired:mich']).toBeUndefined()
  })
})
