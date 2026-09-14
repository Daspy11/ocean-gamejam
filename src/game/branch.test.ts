import { readFileSync } from 'node:fs'
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

describe('the inventory tutorial', () => {
  const c: Content = {
    items: {},
    dialogues: Object.fromEntries(
      ['inventory1', 'inventory2'].map((key) => [
        key,
        JSON.parse(
          readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
        ),
      ]),
    ),
  }

  it.each(['', 'used:orb', 'fired:firstsalt'])(
    'only teaches throwing before the orb was used: %s',
    (flag) => {
      const w = createWorld()
      w.flags['fired:crate'] = true
      if (flag) w.flags[flag] = true
      w.inventory.orb = 1
      apply(w, { type: 'menu' }, c)
      apply(w, { type: 'menu' }, c)
      const lines: string[] = []
      for (let i = 0; i < 10 && w.dialogue; i++) {
        if (w.typing) lines.push(w.typing.text)
        apply(w, w.typing ? { type: 'interact' } : { type: 'tick', dt: 16 }, c)
      }
      expect(w.flags['name:orb']).toBe("tarq's Orb Of Endless Burning")
      expect(lines.includes('try throwing it in the sea')).toBe(!flag)
      expect(lines.includes('so what am i meant to do with this now')).toBe(!flag)
    },
  )

  it('notices the menu closing when its orb is used and skips the now-obsolete instruction', () => {
    const w = createWorld()
    w.flags['fired:crate'] = true
    w.inventory.orb = 1
    Object.assign(w.player, { x: 14, y: 13, facing: 'left' })
    apply(w, { type: 'menu' }, c)
    apply(w, { type: 'interact' }, c)
    expect(w.menu).toBeNull()
    expect(w.flags['used:orb']).toBe(true)
    expect(w.dialogue?.key).toBe('inventory1')
    const lines: string[] = []
    for (let i = 0; i < 10 && w.dialogue; i++) {
      if (w.typing) lines.push(w.typing.text)
      apply(w, w.typing ? { type: 'interact' } : { type: 'tick', dt: 16 }, c)
    }
    expect(lines).not.toContain('try throwing it in the sea')
    expect(w.flags['fired:inventory2']).toBeUndefined()
  })
})
