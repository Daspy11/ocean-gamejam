import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content } from './world'

// a close-up act, a line said over it, an animated one, and a hold on its last frame
const content: Content = {
  dialogues: {
    show: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'in' }],
      nodes: {
        in: { closeup: { sheet: 'walter', frame: 1 }, next: 'line' },
        line: { text: '[PLACEHOLDER show 1]', next: 'play' },
        play: { closeup: { sheet: 'serious', frames: 4 }, next: 'hold' },
        hold: { wait: 1500, next: null },
      },
    },
  },
  items: {},
}

describe('a close-up', () => {
  it('goes up as its node opens and holds the scene for the 500 ms fade to black', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'show' }, content)
    expect(w.closeup).toEqual({ sheet: 'walter', frame: 1, frames: 1, at: 0, since: 0 })
    apply(w, { type: 'tick', dt: 400 }, content)
    expect(w.dialogue?.node).toBe('in')
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.dialogue?.node).toBe('line') // the line is said over the black
    expect(w.closeup?.sheet).toBe('walter') // and the close-up stays up under it
  })

  it('plays a second one over the same black, 400 ms a frame, and comes down with the box', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'show' }, content)
    apply(w, { type: 'tick', dt: 500 }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.closeup).toEqual({ sheet: 'serious', frame: 0, frames: 4, at: 500, since: 0 })
    apply(w, { type: 'tick', dt: 1600 }, content)
    expect(w.dialogue?.node).toBe('play') // four frames take 1600 ms, and a little
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.dialogue?.node).toBe('hold')
    expect(w.closeup?.sheet).toBe('serious') // the last frame stays up through the wait
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect([w.dialogue, w.closeup]).toEqual([null, null])
  })
})
