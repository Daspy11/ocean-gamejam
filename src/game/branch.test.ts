import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

// the shape Walter's walk uses: one dialogue, whose start flags also pick which node to open on so
// each `next` list can be tested from the top
const content: Content = {
  dialogues: {
    branch: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ when: 'at:walk', node: 'walk' }, { when: 'at:only', node: 'only' }, { node: '1' }],
      nodes: {
        '1': {
          text: '[PLACEHOLDER branch 1]',
          next: [{ when: 'x', node: 'a' }, { node: 'b' }],
        },
        walk: {
          walk: { id: 'mich', path: ['up'] },
          next: [{ when: 'x', node: 'a' }, { node: 'b' }],
        },
        only: { text: '[PLACEHOLDER branch only]', next: [{ when: 'x', node: 'a' }] },
        a: { text: '[PLACEHOLDER branch a]', next: null },
        b: { text: '[PLACEHOLDER branch b]', next: null },
      },
    },
  },
  items: {},
}

// opens the dialogue on `node`, with flag x set or not
function open(node: string, x: boolean): World {
  const w = createWorld()
  if (node !== '1') w.flags[`at:${node}`] = true
  if (x) w.flags.x = true
  apply(w, { type: 'talk', key: 'branch' }, content)
  expect(w.dialogue?.node).toBe(node)
  return w
}

describe('a next that branches on flags', () => {
  it('takes the first entry whose flag is truthy', () => {
    const w = open('1', true)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('a')
  })

  it('falls through to the entry with no when', () => {
    const w = open('1', false)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('b')
  })

  it('closes when no entry matches', () => {
    const w = open('only', false)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })

  it('branches the same way when an act finishes on its own', () => {
    for (const x of [true, false]) {
      const w = open('walk', x)
      apply(w, { type: 'tick', dt: 250 }, content)
      expect(w.dialogue?.node).toBe(x ? 'a' : 'b')
    }
  })
})
