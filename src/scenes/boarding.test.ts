import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from '../game/actions'
import { mount, tickWalks } from '../game/boat'
import { choices } from '../game/throw'
import { blast } from '../game/machine'
import { createWorld, npc, type Content, type Obj, type World } from '../game/world'
import { load, world } from '../store'
import { deck, spring } from './crash'

function pose(a: World['player'] | (Obj & { kind: 'npc' }), who: string) {
  const on = world.objects.find((o) => o.id === a.ride)
  const [dx, up] = deck(on, who)
  const x = (a.x + ((a.step?.x ?? a.x) - a.x) * (a.step?.t ?? 0)) * 16
  const y = (a.y + ((a.step?.y ?? a.y) - a.y) * (a.step?.t ?? 0)) * 16 + 16
  return spring(a, x + dx, y - up, up, dx)
}

describe('drawing the ending jumps', () => {
  it('starts at the existing feet and keeps Walter on Mich throughout her jump', () => {
    const w = createWorld()
    const mich = npc('mich', 'mich', 15, 17, 'right', '') as Obj & { kind: 'npc' }
    const walter = npc('walter', 'walter', 15, 18, 'up', '') as Obj & { kind: 'npc' }
    w.objects = [walter, mich, { id: 'rug', kind: 'flyingcarpet', x: 18, y: 17, landAt: -3000 }]
    Object.assign(w.player, { x: 18, y: 18 })
    load(w)
    const from = pose(walter, 'walter')
    mount(w, { id: 'walter', on: 'mich' })
    expect(pose(walter, 'walter')).toEqual(from)
    w.time = 400
    tickWalks(w, 400)
    const feet = pose(mich, 'mich')
    const head = pose(walter, 'walter')
    mount(w, { id: 'mich', on: 'rug' })
    expect(pose(mich, 'mich')).toEqual(feet)
    expect(pose(walter, 'walter')).toEqual(head)
    for (let i = 0; i < 50; i++) {
      w.time += 16
      tickWalks(w, 16)
      if (i === 12) {
        const before = pose(w.player, 'player')
        mount(w, { id: 'player', on: 'rug' })
        expect(pose(w.player, 'player')).toEqual(before)
      }
      const [mx, my] = pose(mich, 'mich')
      const [wx, wy] = pose(walter, 'walter')
      expect(wx - mx).toBeCloseTo(1)
      expect(wy - my).toBeCloseTo(-15)
    }
    expect(pose(w.player, 'player')[0] - pose(mich, 'mich')[0]).toBe(18)
  })
})

describe('the shipped ending dialogue', () => {
  it('plays the revised approach and offers exactly the six requested item copies', () => {
    const tarq = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/tarq.json', import.meta.url), 'utf8'),
    )
    const content: Content = { dialogues: { tarq: { ...tarq, start: [{ node: '2' }] } }, items: {} }
    const w = createWorld()
    w.objects = w.objects.filter((o) => o.kind !== 'chair' && o.id !== 'orb1')
    const mich = w.objects.find((o) => o.id === 'mich') as Obj & { kind: 'npc' }
    Object.assign(mich, { x: 13, y: 14 })
    blast(w, 13, 14)
    w.inventory = { chair: 2, egg: 1, certificate: 1, carpet: 1, seal: 1 }
    apply(w, { type: 'talk', key: 'tarq' }, content)
    for (let i = 0; i < 600 && w.dialogue?.node !== 'pick'; i++) {
      const node = w.dialogue && content.dialogues.tarq.nodes[w.dialogue.node]
      if (w.dialogue?.node === '5') expect([mich.x, mich.y]).toEqual([13, 14])
      if (node && node.text !== undefined) apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 50 }, content)
    }
    expect(w.dialogue?.node).toBe('pick')
    expect(Math.abs(mich.x - 13) + Math.abs(mich.y - 14)).toBe(4)
    const offered = choices(w, content.dialogues.tarq.nodes.pick, content.dialogues.tarq)
    expect(offered.map((c) => c.text)).toEqual([
      'deck chair',
      'deck chair',
      'egg',
      'certificate',
      'carpet',
      'stuffed seal',
    ])
    expect(new Set(offered.map((c) => c.object)).size).toBe(6)
    for (let i = 0; i < 5; i++) apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'interact' }, content)
    for (let i = 0; i < 100 && w.dialogue?.node !== 'pick'; i++)
      apply(w, { type: 'tick', dt: 50 }, content)
    expect(w.dialogue?.node).toBe('pick')
    expect(choices(w, content.dialogues.tarq.nodes.pick, content.dialogues.tarq)).toHaveLength(5)
  })

  it.each([16, 50, 250])('boards and departs with or without Walter at %i ms per frame', (dt) => {
    const tarq = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/tarq.json', import.meta.url), 'utf8'),
    )
    const content: Content = {
      dialogues: { tarq: { ...tarq, start: [{ node: 'ask' }] } },
      items: {},
    }
    for (const yes of [true, false]) {
      const w = createWorld()
      blast(w, 14, 17)
      const mich = w.objects.find((o) => o.id === 'mich') as Obj & { kind: 'npc' }
      Object.assign(mich, { x: 15, y: 17, facing: 'right' })
      const walter = npc('walter', 'walter', 18, 18, 'up', '') as Obj & { kind: 'npc' }
      w.objects.push(
        walter,
        { id: 'flyingcarpet1', kind: 'flyingcarpet', x: 18, y: 17, landAt: -3000 },
        { ...npc('tarq', 'tarq', 16, 17, 'left', ''), flat: true } as Obj,
        npc('seahorse', 'seahorse', 8, 17, 'right', ''),
        { id: 'cannon', kind: 'cannon', x: 19, y: 17 },
      )
      Object.assign(w.player, { x: 17, y: 16 })
      apply(w, { type: 'talk', key: 'tarq' }, content)
      for (let i = 0; i < 30000 / dt && !w.flags.outro; i++) {
        const node = w.dialogue && content.dialogues.tarq.nodes[w.dialogue.node]
        if (node && node.text !== undefined) {
          if (node.choices && !yes) apply(w, { type: 'move', dir: 'down' }, content)
          apply(w, { type: 'interact' }, content)
        }
        apply(w, { type: 'tick', dt }, content)
        const rug = w.objects.find((o) => o.kind === 'flyingcarpet')
        if (rug?.kind === 'flyingcarpet' && rug.liftAt !== undefined && rug.x < 32)
          expect(rug.step).toBeTruthy() // takeoff flows into departure without stopping to wait
        if (yes && walter.ride) expect([walter.x, walter.y]).toEqual([mich.x, mich.y])
        if (w.player.ride) expect([w.player.x, w.player.y]).toEqual([mich.x, mich.y])
      }
      expect(w.flags.outro).toBe(true)
      expect(w.player).toMatchObject({ x: 32, y: 17, ride: 'flyingcarpet1' })
      expect(mich).toMatchObject({ x: 32, y: 17, ride: 'flyingcarpet1' })
      expect(walter.ride).toBe(yes ? 'mich' : undefined)
      expect([w.player.hop, mich.hop, walter.hop]).toEqual([undefined, undefined, undefined])
    }
  })
})
