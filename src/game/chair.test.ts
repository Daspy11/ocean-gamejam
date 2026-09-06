import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

// suspicious harry's deck chairs at 41..43,26 on the south shore, with him stood over them at 42,25
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
          next: null,
        },
        after: { text: '[PLACEHOLDER after]', next: null },
      },
    },
  },
  items: {},
}

// on the sand below chair1, facing up at it
function belowChair(): World {
  const w = createWorld()
  w.player = { ...w.player, x: 41, y: 27, facing: 'up' }
  return w
}

describe('the deck chairs', () => {
  it("are harry's until he says so: interact only gets you shouted at", () => {
    const w = belowChair()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('handsoff')
    expect(w.objects.some((o) => o.id === 'chair1')).toBe(true)
    expect(w.inventory.chair).toBeUndefined()
  })

  it('come away one per interact once he has had his cocktail', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 42, y: 24, facing: 'down' } // harry at 42,25
    w.flags['harry:asked'] = true
    w.inventory.otijom = 1
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('cocktail')
    expect([w.inventory.otijom, w.flags['harry:ok']]).toEqual([undefined, true])
    apply(w, { type: 'interact' }, content) // dismiss it

    w.player = { ...w.player, x: 41, y: 27, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.chair).toBe(1)
    expect(w.objects.some((o) => o.id === 'chair1')).toBe(false)
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'chair' })
  })
})
