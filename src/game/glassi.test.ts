import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { walkPlayer } from './boat'
import { makeSalt } from './salt'
import { choices } from './throw'
import { createWorld, npc, tileAt, type Content } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['west', 'note', 'pirate', 'etarp', 'cannon', 'etarip-farewell', 'got'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: { glassi: { name: 'glass i' } },
}

describe('the glass i', () => {
  it('keeps the note in the bag and rereads it without granting another copy', () => {
    let w = createWorld()
    Object.assign(w.player, { x: 49, y: 22, facing: 'left' })
    apply(w, { type: 'interact' }, content)
    for (let i = 0; i < 10 && w.dialogue; i++) apply(w, { type: 'interact' }, content)
    expect(w.inventory).toMatchObject({ note: 1 })
    w = JSON.parse(JSON.stringify(w))
    for (let read = 0; read < 2; read++) {
      apply(w, { type: 'menu' }, content)
      apply(w, { type: 'interact' }, content)
      expect(w.menu).toBeNull()
      expect(w.dialogue).toMatchObject({ key: 'note', node: '2' })
      expect(w.typing?.text).toBe('the note reads:')
      for (let i = 0; i < 10 && w.dialogue; i++) apply(w, { type: 'interact' }, content)
      expect(w.inventory).toMatchObject({ note: 1 })
    }
  })
  it.each([false, true])('answers the west warning only after finding the note: %s', (found) => {
    let w = createWorld()
    if (found) {
      Object.assign(w.player, { x: 49, y: 22, facing: 'left' })
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue?.key).toBe('note')
      for (let i = 0; i < 7; i++) apply(w, { type: 'interact' }, content)
      expect(w.dialogue).toBeNull()
      expect(w.flags['had:note']).toBe(true)
      w = JSON.parse(JSON.stringify(w))
    }
    for (const x of [10, 9, 8]) makeSalt(w, x, 17)
    Object.assign(w.player, { x: 10, y: 17, facing: 'left', step: { x: 9, y: 17, t: 0 } })
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.typing).toMatchObject({ who: 'Mich', text: "there's actually nothing that way" })
    apply(w, { type: 'interact' }, content)
    if (found) {
      expect(w.typing).toMatchObject({ who: 'You', text: 'i have a hunch' })
      apply(w, { type: 'interact' }, content)
      expect(w.typing).toMatchObject({ who: 'Mich', text: 'whatever' })
      apply(w, { type: 'interact' }, content)
    }
    expect(w.dialogue).toBeNull()
    w.player.step = { x: 8, y: 17, t: 0 }
    apply(w, { type: 'tick', dt: 217 }, content)
    expect(w.dialogue).toBeNull()
  })

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

  it('spends the i, charges, speaks, then renames Etarp', () => {
    const w = createWorld()
    w.inventory.glassi = 1
    const etarp = npc('etarp', 'etarp', 22, 2, 'down', 'etarp')
    w.objects.push(etarp)
    w.dialogue = { key: 'pirate', node: '21', choice: 1 }
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.glassi).toBeUndefined()
    expect(etarp.kind === 'npc' && etarp.spin).toBeUndefined()
    apply(w, { type: 'tick', dt: 4000 }, content)
    expect(content.dialogues.pirate.nodes[w.dialogue!.node].text).toBe('YARR')
    apply(w, { type: 'interact' }, content)
    expect(content.dialogues.pirate.nodes[w.dialogue!.node].text).toBe('ME I!')
    expect(w.flags['name:Etarp']).toBeUndefined()
    apply(w, { type: 'interact' }, content)
    expect(w.flags['name:Etarp']).toBe('etarip')
    expect(w.flags['etarp:i']).toBe(true)
  })

  it.each(['pirate', 'etarp', 'cannon'])(
    'zooms, charges and resumes the i handover in %s',
    (key) => {
      let w = createWorld()
      w.inventory.glassi = 1
      w.objects.push(npc('etarp', 'etarp', 22, 2, 'down', 'etarp'))
      w.dialogue = {
        key,
        node: key === 'pirate' ? '21' : key === 'etarp' ? 'iFound' : 'iApproach',
        choice: key === 'pirate' ? 1 : 0,
      }
      apply(w, key === 'cannon' ? { type: 'tick', dt: 0 } : { type: 'interact' }, content)
      expect(w.inventory.glassi).toBeUndefined()
      expect(w.closeup).toMatchObject({ sheet: 'etarp', frame: 1, burst: null, auto: true })
      const node = w.dialogue?.node
      for (const type of ['interact', 'confirm', 'menu'] as const) apply(w, { type }, content)
      expect(w.dialogue?.node).toBe(node)
      expect(w.menu).toBeNull()
      apply(w, { type: 'tick', dt: 1000 }, content)
      expect(w.closeup?.burst).toBe(1000)
      w = JSON.parse(JSON.stringify(w))
      apply(w, { type: 'tick', dt: 2000 }, content)
      expect(w.closeup?.down).toBe(3000)
      expect(w.dialogue?.node).toBe(node)
      apply(w, { type: 'tick', dt: 1000 }, content)
      expect(w.closeup).toBeNull()
      expect(w.typing).toMatchObject({ text: key === 'pirate' ? 'YARR' : 'ME I!', at: 4000 })
      if (key === 'pirate') apply(w, { type: 'interact' }, content)
      apply(w, { type: 'interact' }, content)
      expect(w.flags['etarp:i']).toBe(true)
    },
  )

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
