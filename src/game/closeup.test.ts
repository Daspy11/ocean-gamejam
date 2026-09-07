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
    // a dramatic one: a zoom in on the npc, who shatters into stars on the burst act
    entry: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'in' }],
      nodes: {
        in: { closeup: { sheet: 'walter', frame: 1, burst: true }, next: 'line' },
        line: { text: '[PLACEHOLDER entry 1]', next: 'pop' },
        pop: { burst: true, next: 'after' },
        after: { text: '[PLACEHOLDER entry 2]', next: 'off' },
        off: { closeup: null, next: 'last' },
        last: { text: '[PLACEHOLDER entry 3]', next: null },
      },
    },
    // one that comes down mid-scene, so the talk can carry on at ground level
    down: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'in' }],
      nodes: {
        in: { closeup: { sheet: 'walter', frame: 1 }, next: 'line' },
        line: { text: '[PLACEHOLDER down 1]', next: 'off' },
        off: { closeup: null, next: 'after' },
        after: { text: '[PLACEHOLDER down 2]', next: null },
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

  it('comes down at once on a closeup of null, and the box goes on without it', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'down' }, content)
    apply(w, { type: 'tick', dt: 500 }, content)
    expect(w.dialogue?.node).toBe('line')
    const rev = w.rev
    apply(w, { type: 'interact' }, content)
    expect(w.closeup).toBeNull()
    expect(w.rev).toBeGreaterThan(rev)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.dialogue?.node).toBe('after') // no fade to wait for: the next line is straight up
  })

  it('with burst zooms for 1 s, then the burst act shakes him apart and holds for 2 s', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'entry' }, content)
    expect(w.closeup?.burst).toBeNull()
    apply(w, { type: 'tick', dt: 500 }, content)
    expect(w.dialogue?.node).toBe('in') // twice the fade to black: the camera is still going in
    apply(w, { type: 'tick', dt: 500 }, content)
    expect(w.dialogue?.node).toBe('line')
    apply(w, { type: 'interact' }, content)
    expect(w.closeup?.burst).toBe(1000) // he starts to shake as the line goes
    apply(w, { type: 'tick', dt: 1900 }, content)
    expect(w.dialogue?.node).toBe('pop')
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.dialogue?.node).toBe('after')
    expect(w.closeup?.sheet).toBe('walter') // and he is up in the open now
  })

  it('taken down, a burst one lingers 1 s for the camera to ease back out', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'entry' }, content)
    apply(w, { type: 'tick', dt: 1000 }, content)
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 2000 }, content)
    expect(w.dialogue?.node).toBe('after')
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.dialogue?.node).toBe('last') // the take-down holds nothing up
    expect(w.closeup?.down).toBe(3000) // set as the node opened, before the tick
    apply(w, { type: 'tick', dt: 984 }, content)
    expect(w.closeup).toBeNull()
  })
})
