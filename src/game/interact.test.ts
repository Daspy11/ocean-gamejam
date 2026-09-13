import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { startAct } from './act'
import { useItem } from './salt'
import { createWorld, type Content, type Obj } from './world'

const content: Content = {
  dialogues: {
    sign: {
      name: '',
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER inspection]', next: '2' },
        '2': { text: '[PLACEHOLDER inspection end]' },
      },
    },
  },
  items: {},
}

function setup(obj?: Obj) {
  const w = createWorld()
  w.left = 0
  w.tiles.fill('grass')
  w.objects = obj ? [obj] : []
  w.inventory = {}
  Object.assign(w.player, { x: 0, y: 0, facing: 'right', held: null })
  return w
}

describe('shared interaction cues', () => {
  it.each([
    { kind: 'sign', dialogue: 'sign' },
    { kind: 'boat', dialogue: 'sign' },
    { kind: 'tree', dialogue: 'sign' },
    { kind: 'npc', sprite: 'mich', facing: 'left', dialogue: 'sign' },
    { kind: 'crate', open: false, item: 'key' },
    { kind: 'rum' },
    { kind: 'chair' },
    { kind: 'carrot' },
    { kind: 'orb', doneAt: 0 },
    { kind: 'bar', drink: true },
    { kind: 'gate' },
  ] as const)('cues a $kind interaction', (obj) => {
    const w = setup({ id: 'target', x: 1, y: 0, ...obj })
    Object.assign(w.flags, { 'harry:ok': true, 'shrimp:asked': true })
    apply(w, { type: 'interact' }, content)
    expect(w.interactCue).toBeGreaterThan(0)
  })

  it('does not cue empty interactions, open chests, walking, or each dialogue line', () => {
    const w = setup({ id: 'sign', kind: 'sign', dialogue: 'sign', x: 1, y: 0 })
    apply(w, { type: 'interact' }, content)
    const cue = w.interactCue
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    w.objects = [{ id: 'chest', kind: 'crate', open: true, item: 'key', x: 1, y: 0 }]
    apply(w, { type: 'interact' }, content)
    w.objects = []
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    expect(w.interactCue).toBe(cue)
  })

  it('cues orb launch and salt completion, but not an invalid throw or idle ticks', () => {
    const w = setup()
    w.inventory.orb = 1
    apply(w, { type: 'interact' }, content)
    expect(w.interactCue).toBeUndefined()
    w.tiles[1] = 'water'
    apply(w, { type: 'interact' }, content)
    expect(w.interactCue).toBe(1)
    apply(w, { type: 'tick', dt: 1999 }, content)
    expect(w.interactCue).toBe(1)
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.interactCue).toBe(2)
    apply(w, { type: 'tick', dt: 1000 }, content)
    expect(w.interactCue).toBe(2)
  })

  it.each(['carpet', 'egg', 'certificate', 'chair'] as const)(
    'cues placing %s from inventory',
    (item) => {
      const w = setup()
      w.inventory[item] = 1
      apply(w, { type: 'menu' }, content)
      const before = w.chimeCue ?? 0
      apply(w, { type: 'interact' }, content)
      expect(w.chimeCue).toBeGreaterThan(before)
    },
  )

  it('chimes for home placement, keeps the tok away, and stays quiet on failed placement', () => {
    const w = setup()
    w.inventory.chair = 2
    w.main[1] = true
    useItem(w, 'chair', 1, 0)
    expect(w.chimeCue).toBe(1)
    expect(w.interactCue).toBeUndefined()
    useItem(w, 'chair', 1, 0)
    expect(w.chimeCue).toBe(1)
    w.main[2] = false
    useItem(w, 'chair', 2, 0)
    expect(w.interactCue).toBe(1)
    expect(w.chimeCue).toBe(1)
  })

  it('cues each bar tile and a drink, but not duplicate spawns or offshore characters', () => {
    const w = setup()
    const d = { key: 'pirate', node: '45', choice: 0 }
    for (let i = 0; i < 4; i++) {
      const node = { spawn: { id: `bar${i}`, kind: 'bar' as const, x: i + 1, y: 0 } }
      startAct(w, d, node, content)
      startAct(w, d, node, content)
      expect(w.interactCue).toBe(i + 1)
    }
    startAct(w, d, { drink: 'bar0' }, content)
    expect(w.interactCue).toBe(5)
    startAct(
      w,
      d,
      {
        spawn: {
          id: 'npc',
          kind: 'npc',
          x: 50,
          y: 0,
          sprite: 'etarp',
          facing: 'left',
          dialogue: 'sign',
        },
      },
      content,
    )
    expect(w.interactCue).toBe(5)
  })

  it('cues gifts, handovers, and tree shakes in dialogue', () => {
    const w = setup({ id: 'tree', kind: 'tree', x: 1, y: 0 })
    w.inventory.rum = 1
    const c: Content = {
      items: {},
      dialogues: {
        trade: {
          name: '',
          start: [{ node: '1' }],
          nodes: {
            '1': { text: '[PLACEHOLDER trade]', take: 'rum', give: 'egg', next: '2' },
            '2': { shake: 'tree' },
          },
        },
      },
    }
    apply(w, { type: 'talk', key: 'trade' }, c)
    expect(w.interactCue).toBe(2)
    apply(w, { type: 'interact' }, c)
    expect(w.interactCue).toBe(3)
  })
})
