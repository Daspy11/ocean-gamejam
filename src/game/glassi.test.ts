import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { walkPlayer } from './boat'
import { makeSalt } from './salt'
import { choices } from './throw'
import { createWorld, npc, tileAt, type Content } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['west', 'pirate', 'etarip-farewell', 'got'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: { glassi: { name: 'glass i' } },
}

describe('the glass i', () => {
  it('keeps the west island present, warns at four tiles, and allows bridging to its chest', () => {
    const w = createWorld()
    expect(w.objects.find((o) => o.id === 'crate5')).toMatchObject({ x: -3, y: 17, open: false })
    for (const y of [17, 18]) for (const x of [-3, -2]) expect(tileAt(w, x, y)).toBe('sand')
    for (let x = 12; x >= -1; x--) makeSalt(w, x, 17)
    Object.assign(w.player, { x: 10, y: 17, facing: 'left' })
    w.player.step = { x: 9, y: 17, t: 0 }
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.dialogue?.key).toBe('west')
    apply(w, { type: 'interact' }, content)
    w.player.step = { x: 8, y: 17, t: 0 }
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.dialogue).toBeNull()
    walkPlayer(w, { id: 'player', to: { x: -2, y: 17 }, facing: 'left' })
    for (let i = 0; i < 100 && (w.player.step || w.player.path?.length); i++)
      apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.player).toMatchObject({ x: -2, y: 17, facing: 'left', step: null })
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.glassi).toBe(1)
    expect(w.dialogue).toMatchObject({ key: 'got', item: 'glassi' })
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.glassi).toBe(1)
    expect(w.dialogue).toBeNull()
    expect(tileAt(JSON.parse(JSON.stringify(w)), -1, 17)).toBe('salt')
  })

  it.each([false, true])('only offers the i while it is in the bag: %s', (has) => {
    const w = createWorld()
    if (has) w.inventory.glassi = 1
    const options = choices(w, content.dialogues.pirate.nodes['21'], content.dialogues.pirate)
    expect(options.map((o) => o.text)).toEqual(
      has ? ['that sucks', 'i actually found an i you could have'] : ['that sucks'],
    )
    w.dialogue = { key: 'pirate', node: '21', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('22')
    expect(w.flags['etarp:i']).toBeUndefined()
    expect(w.inventory.glassi).toBe(has ? 1 : undefined)
  })

  it('spends the i, spins, speaks, then renames Etarp', () => {
    const w = createWorld()
    w.inventory.glassi = 1
    const etarp = npc('etarp', 'etarp', 22, 2, 'down', 'etarp')
    w.objects.push(etarp)
    w.dialogue = { key: 'pirate', node: '21', choice: 1 }
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.glassi).toBeUndefined()
    expect(etarp.kind === 'npc' && etarp.spin).toBe(2000)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(content.dialogues.pirate.nodes[w.dialogue!.node].text).toBe('YARR')
    apply(w, { type: 'interact' }, content)
    expect(content.dialogues.pirate.nodes[w.dialogue!.node].text).toBe('ME I!')
    expect(w.flags['name:Etarp']).toBeUndefined()
    apply(w, { type: 'interact' }, content)
    expect(w.flags['name:Etarp']).toBe('etarip')
    expect(w.flags['etarp:i']).toBe(true)
  })

  it('holds the boat alongside through both lines, then departs before Mich speaks', () => {
    const w = createWorld()
    Object.assign(w.flags, { outro: true, 'etarp:i': true })
    apply(w, { type: 'tick', dt: 0 }, content)
    apply(w, { type: 'tick', dt: 5000 }, content)
    expect(w.farewell?.phase).toBe('approach')
    apply(w, { type: 'tick', dt: 1600 }, content)
    expect(w.farewell?.phase).toBe('alongside')
    expect(w.dialogue?.key).toBe('etarip-farewell')
    apply(w, { type: 'tick', dt: 10000 }, content)
    expect(w.farewell?.phase).toBe('alongside')
    apply(w, { type: 'interact' }, content)
    expect(content.dialogues['etarip-farewell'].nodes[w.dialogue!.node].text).toBe(
      'BLESSINS BE UPON YE',
    )
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 0 }, content)
    expect(w.farewell?.phase).toBe('leave')
    apply(w, { type: 'tick', dt: 1600 }, content)
    expect(w.farewell?.phase).toBe('gone')
    expect(content.dialogues['etarip-farewell'].nodes[w.dialogue!.node].text).toBe('what a cutie')
    apply(w, { type: 'interact' }, content)
    expect(content.dialogues['etarip-farewell'].nodes[w.dialogue!.node].text).toBe('...')
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 0 }, content)
    expect(w.farewell?.phase).toBe('done')
    expect(w.dialogue).toBeNull()
    expect(JSON.parse(JSON.stringify(w)).farewell.phase).toBe('done')
  })

  it('keeps the normal ending when the i was not given', () => {
    const w = createWorld()
    w.flags.outro = true
    w.inventory.glassi = 1
    apply(w, { type: 'tick', dt: 30000 }, content)
    expect(w.farewell).toBeUndefined()
    expect(w.dialogue).toBeNull()
  })
})
