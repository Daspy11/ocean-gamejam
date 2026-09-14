import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, objectAt, type Content, type World } from './world'

// suspicious harry's deck chairs on row 26 of the south shore, on 40, across 41..42 and on 43,
// sharing the row with his 4x1 picture: a tile is him until the chair on it is let go of
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    handsoff: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER hands off]', next: null } },
    },
    // the shape of assets/dialogue/harry.json: the ask, and the cocktail that buys the chairs
    harry: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [
        { when: 'harry:ok', node: 'after' },
        { when: 'harry:asked', has: { otijom: 1 }, node: 'cocktail' },
        { when: 'harry:asked', node: 'again' },
        { node: '1' },
      ],
      nodes: {
        '1': { text: '[PLACEHOLDER hello]', next: '2' },
        '2': { text: '[PLACEHOLDER a cocktail then]', set: { 'harry:asked': true }, next: null },
        again: { text: '[PLACEHOLDER a cocktail then]', next: null },
        cocktail: {
          text: '[PLACEHOLDER thanks]',
          take: 'otijom',
          set: { 'harry:ok': true },
          sit: 'harry',
          next: null,
        },
        after: { text: '[PLACEHOLDER after]', next: null },
      },
    },
  },
  items: {},
}

// on the sand below the left half of his middle chair, facing up at it
function belowChair(): World {
  const w = createWorld()
  w.player = { ...w.player, x: 41, y: 27, facing: 'up' }
  return w
}

describe('the deck chairs', () => {
  it.each([
    ['', 'warning'],
    ['harry:warned', '1'],
    ['harry:asked', 'again'],
    ['harry:ok', 'after'],
  ])('prioritises the introduction and only then rejects rum, at stage %s', (flag, normal) => {
    const c: Content = {
      dialogues: {
        harry: JSON.parse(
          readFileSync(new URL('../../assets/dialogue/harry.json', import.meta.url), 'utf8'),
        ),
      },
      items: {},
    }
    for (const rum of [0, 1])
      for (const otijom of [0, 1]) {
        const w = belowChair()
        Object.assign(w.player, { x: 40, y: 25, facing: 'down' })
        if (flag) w.flags[flag] = true
        w.inventory = { rum, otijom }
        apply(w, { type: 'interact' }, c)
        if (rum && !otijom && flag === 'harry:asked') {
          expect(w.typing?.text).toBe("MATE I AINT DRINKIN RAW SPIRITS. YOU THINK I'M AN ANIMAL?")
          apply(w, { type: 'interact' }, c)
          expect(w.dialogue).toBeNull()
          expect(w.flags['harry:ok']).toBeUndefined()
        } else expect(w.dialogue?.node).toBe(otijom && flag === 'harry:asked' ? 'cocktail' : normal)
        expect(w.inventory.rum).toBe(rum)
      }
  })

  it.each(['', 'harry:warned', 'harry:asked'])(
    'accepts a cocktail and lowers his feet before freeing the chairs: %s',
    (flag) => {
      const c: Content = {
        dialogues: {
          harry: JSON.parse(
            readFileSync(new URL('../../assets/dialogue/harry.json', import.meta.url), 'utf8'),
          ),
        },
        items: {},
      }
      const w = belowChair()
      Object.assign(w.player, { x: 40, y: 25, facing: 'down' })
      if (flag) w.flags[flag] = true
      w.inventory = { otijom: 1, rum: 1 }
      apply(w, { type: 'interact' }, c)
      if (flag !== 'harry:asked') {
        for (let i = 0; i < 20 && w.dialogue; i++) apply(w, { type: 'interact' }, c)
        expect(w.flags['harry:asked']).toBe(true)
        expect(w.inventory.otijom).toBe(1)
        apply(w, { type: 'interact' }, c)
      }
      expect(w.typing?.text).toBe("MMM, THAT'S WHAT I NEED")
      expect(w.inventory.otijom).toBeUndefined()
      expect(w.inventory.rum).toBe(1)
      apply(w, { type: 'interact' }, c)
      expect(w.objects.find((o) => o.id === 'harry')).toHaveProperty('satAt', w.time)
      const hidden = () =>
        w.objects
          .filter((o) => (o.kind === 'chair' || o.kind === 'splitchair') && o.hidden)
          .map((o) => o.id)
      apply(w, { type: 'tick', dt: 999 }, c) // the box's 600 ms wait is up, but he has not moved
      expect(hidden()).toEqual(['chair1', 'chair3', 'chair2'])
      expect(w.dialogue?.node).toBe('sit')
      expect(w.explosionCue).toBeUndefined()
      apply(w, { type: 'tick', dt: 1 }, c) // his left leg comes down with a crash, off the west one
      expect(hidden()).toEqual(['chair3', 'chair2'])
      expect(w.explosionCue).toBe(1)
      apply(w, { type: 'tick', dt: 1000 }, c) // then his right, off the east one
      expect(hidden()).toEqual(['chair2'])
      expect(w.explosionCue).toBe(2)
      apply(w, { type: 'tick', dt: 399 }, c)
      expect(hidden()).toEqual(['chair2'])
      expect(w.flags['harry:ok']).toBeUndefined()
      apply(w, { type: 'tick', dt: 1 }, c) // and he settles on the one under him, quietly
      expect(hidden()).toEqual([])
      expect(w.explosionCue).toBe(2)
      apply(w, { type: 'tick', dt: 0 }, c)
      expect(w.flags['harry:ok']).toBe(true)
      expect(w.dialogue).toBeNull()
      Object.assign(w.player, { x: 41, y: 27, facing: 'up' })
      apply(w, { type: 'interact' }, c)
      expect(w.inventory.chair).toBe(1)
      expect(
        w.objects.filter((o) => o.kind === 'chair' || o.kind === 'splitchair').map((o) => o.id),
      ).toEqual(['chair1', 'chair3'])
    },
  )

  it.each(['chair', 'harry'])(
    'plays the Stella exchange once when first approaching %s',
    (first) => {
      const c: Content = {
        ...content,
        dialogues: Object.fromEntries(
          ['handsoff', 'harry'].map((key) => [
            key,
            JSON.parse(
              readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
            ),
          ]),
        ),
      }
      const w = belowChair()
      if (first === 'harry') Object.assign(w.player, { x: 40, y: 25, facing: 'down' })
      apply(w, { type: 'interact' }, c)
      for (const [who, text] of [
        ['suspicious harry', 'GET YER HANDS OFF THOSE CHAIRS'],
        ['', 'do you really need all three'],
        ['suspicious harry', 'yes'],
        ['', 'why'],
        ['suspicious harry', 'I DRANK MY LAST CAN OF STELLA'],
      ]) {
        const d = c.dialogues[w.dialogue!.key]
        const node = d.nodes[w.dialogue!.node]
        expect([node.who ?? d.name, node.text]).toEqual([who, text])
        apply(w, { type: 'interact' }, c)
      }
      expect(w.flags['harry:warned']).toBe(true)
      for (let i = 0; i < 10 && w.dialogue; i++) apply(w, { type: 'interact' }, c)
      expect(w.flags['harry:asked']).toBe(true) // the one talk runs on into the ask, from either tile
      for (const at of [
        { x: 41, y: 27, facing: 'up' as const },
        { x: 40, y: 25, facing: 'down' as const },
      ]) {
        Object.assign(w.player, at)
        apply(w, { type: 'interact' }, c)
        expect(w.dialogue?.node).toBe('again')
        apply(w, { type: 'interact' }, c)
        expect(w.dialogue).toBeNull()
      }
    },
  )

  it("are harry's until he says so: a chair still under him is him", () => {
    const w = belowChair()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toMatchObject({ key: 'harry', node: '1' })
    expect(w.objects.some((o) => o.id === 'chair2')).toBe(true)
    expect(w.inventory.chair).toBeUndefined()
  })

  it('comes away before he is talked to, once he has let go of the one on that tile', () => {
    const w = belowChair()
    delete w.objects.find((o) => o.id === 'chair1')!.hidden // only the west one so far
    Object.assign(w.player, { x: 40, y: 25, facing: 'down' })
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.chair).toBe(1)
    expect(w.objects.some((o) => o.id === 'chair1')).toBe(false)
    expect(w.dialogue?.key).toBe('got')
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content) // the tile is his again, with the chair gone
    expect(w.dialogue).toMatchObject({ key: 'harry', node: '1' })
  })

  it('come away one per interact once he has had his cocktail', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 40, y: 25, facing: 'down' } // over the west chair, still under him
    w.flags['harry:asked'] = true
    w.inventory.otijom = 1
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('cocktail')
    expect([w.inventory.otijom, w.flags['harry:ok']]).toEqual([undefined, true])
    apply(w, { type: 'interact' }, content) // dismiss it
    apply(w, { type: 'tick', dt: 2400 }, content) // his feet down and the chairs out from under him

    w.player = { ...w.player, x: 41, y: 27, facing: 'up' } // the left half of the one across 41..42
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.chair).toBe(1)
    expect(w.objects.some((o) => o.id === 'chair2')).toBe(false) // both halves gone: it was one chair
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'chair' })
  })

  it('takes the split chair whole from its right half too, and the others from their own tiles', () => {
    const w = createWorld()
    w.flags['harry:ok'] = true
    for (const o of w.objects) if (o.kind === 'chair' || o.kind === 'splitchair') delete o.hidden
    w.player = { ...w.player, x: 42, y: 27, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.objects.some((o) => o.id === 'chair2')).toBe(false)
    expect(objectAt(w, 41, 26)?.id).toBe('harry') // nothing left on either tile but him
    apply(w, { type: 'interact' }, content) // dismiss the got box
    w.player = { ...w.player, x: 39, y: 26, facing: 'right' } // the west one, on his first tile
    apply(w, { type: 'interact' }, content)
    w.player = { ...w.player, x: 43, y: 27, facing: 'up' } // and the east one
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.chair).toBe(3)
    expect(w.objects.some((o) => o.kind === 'chair' || o.kind === 'splitchair')).toBe(false)
  })
})
