import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content } from './world'

// the shape of assets/dialogue/boat.json: one line about the wreck, and no speaker name to draw
const content: Content = {
  dialogues: {
    boat: { name: '', start: [{ node: '1' }], nodes: { '1': { text: '[PLACEHOLDER boat 1]' } } },
  },
  items: {},
}

describe('examining the wreck', () => {
  it('opens the boat line from the spawn, looking back at the boat', () => {
    const w = createWorld() // 14,16, one tile inland of the wreck's dry half at 13,16
    w.player.facing = 'left'
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'boat', node: '1', choice: 0, item: undefined })
    expect(content.dialogues.boat.name).toBe('') // no one is speaking: the box draws no name

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })
})
