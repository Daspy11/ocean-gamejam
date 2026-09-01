import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, tileAt, type Content } from './world'

const content: Content = {
  dialogues: {
    npc1: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ when: 'npc1_met', node: 'again' }, { node: 'greet' }],
      nodes: {
        greet: {
          text: '[PLACEHOLDER greeting]',
          choices: [
            { text: '[PLACEHOLDER choice A]', next: 'a', set: { npc1_met: true, npc1_choice: 1 } },
            { text: '[PLACEHOLDER choice B]', next: 'b', set: { npc1_met: true, npc1_choice: 2 } },
          ],
        },
        a: { text: '[PLACEHOLDER reply A]', next: null },
        b: { text: '[PLACEHOLDER reply B]', next: null },
        again: { text: '[PLACEHOLDER repeat greeting]', next: null },
      },
    },
  },
}

describe('move', () => {
  it('walks onto sand and grass and always sets facing', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right' }, content)
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([17, 16, 'right'])

    w.player.cooldown = 0
    apply(w, { type: 'move', dir: 'right' }, content) // 18,16 is the sand border
    expect(tileAt(w, w.player.x, w.player.y)).toBe('sand')
    expect(w.player.x).toBe(18)
  })

  it('does not walk into water but still turns', () => {
    const w = createWorld()
    w.player.x = 14
    apply(w, { type: 'move', dir: 'left' }, content)
    expect([w.player.x, w.player.facing]).toEqual([14, 'left'])
  })

  it('is throttled by the step cooldown', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    expect(w.player.x).toBe(17)

    apply(w, { type: 'tick', dt: 160 }, content)
    apply(w, { type: 'move', dir: 'right' }, content)
    expect(w.player.x).toBe(18)
  })

  it('treats npc and tidepool tiles as blocked', () => {
    const w = createWorld()
    w.player.x = 17
    w.player.y = 15
    apply(w, { type: 'move', dir: 'right' }, content) // npc1 stands on 18,15
    expect([w.player.x, w.player.facing]).toEqual([17, 'right'])

    w.player.x = 15
    w.player.y = 14
    w.player.cooldown = 0
    apply(w, { type: 'move', dir: 'left' }, content) // tidepool sits on 14,14
    expect(w.player.x).toBe(15)
  })
})

describe('tidepools', () => {
  it('grows a stone at nextAt and collecting it restarts the timer', () => {
    const w = createWorld()
    apply(w, { type: 'tick', dt: 2999 }, content)
    expect(w.tidepools[0].stone).toBe(false)
    const before = w.rev
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.tidepools[0].stone).toBe(true)
    expect(w.rev).toBe(before + 1)

    w.player.x = 15
    w.player.y = 14
    w.player.facing = 'left'
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.stone).toBe(1)
    expect(w.tidepools[0].stone).toBe(false)
    expect(w.tidepools[0].nextAt).toBe(w.time + 3000)
  })
})

describe('placing stone', () => {
  it('turns the faced water tile into sand and spends a stone', () => {
    const w = createWorld()
    w.player.x = 14
    w.player.facing = 'left'
    w.inventory.stone = 1
    apply(w, { type: 'interact' }, content)
    expect(tileAt(w, 13, 16)).toBe('sand')
    expect(w.inventory.stone).toBe(0)
  })

  it('does nothing without a stone', () => {
    const w = createWorld()
    w.player.x = 14
    w.player.facing = 'left'
    const before = w.rev
    apply(w, { type: 'interact' }, content)
    expect(tileAt(w, 13, 16)).toBe('water')
    expect(w.rev).toBe(before)
  })
})

describe('dialogue', () => {
  // player standing west of npc1 (18,15), facing it
  function atNpc() {
    const w = createWorld()
    w.player.x = 17
    w.player.y = 15
    w.player.facing = 'right'
    return w
  }

  it('runs a choice route and reopens on the flag route', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ npc: 'npc1', node: 'greet', choice: 0 })

    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.dialogue?.choice).toBe(1)

    apply(w, { type: 'interact' }, content)
    expect(w.flags).toEqual({ npc1_met: true, npc1_choice: 2 })
    expect(w.dialogue?.node).toBe('b')

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('again')
  })

  it('clamps the choice cursor and ignores left/right', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'move', dir: 'up' }, content)
    expect(w.dialogue?.choice).toBe(0)

    apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.dialogue?.choice).toBe(1)

    const before = w.rev
    apply(w, { type: 'move', dir: 'right' }, content)
    expect(w.dialogue?.choice).toBe(1)
    expect(w.rev).toBe(before)
  })

  it('closes instead of throwing on missing content', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, { dialogues: {} })
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    w.dialogue = { npc: 'npc1', node: 'nope', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })
})

describe('rev', () => {
  it('moves only on a visible change', () => {
    const w = createWorld()
    const idle = w.rev
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.rev).toBe(idle)

    apply(w, { type: 'move', dir: 'right' }, content) // turns and steps
    expect(w.rev).toBe(idle + 2)

    const moved = w.rev
    apply(w, { type: 'move', dir: 'up' }, content) // cooldown blocks the step, facing still changes
    expect(w.rev).toBe(moved + 1)
    expect(w.player.y).toBe(16)
  })
})
