import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { revealed } from './script'
import { createWorld, type Content } from './world'

const c: Content = {
  items: { orb: { name: '[PLACEHOLDER orb]' } },
  dialogues: {
    test: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'a' }],
      nodes: {
        a: { text: '[PLACEHOLDER first]', next: 'b' },
        b: {
          text: '[PLACEHOLDER second]',
          choices: [{ text: '[PLACEHOLDER choice]', next: 'wait', set: { picked: true } }],
        },
        wait: { wait: 100, next: 'a' },
      },
    },
  },
}

describe('progressive dialogue', () => {
  it('holds Etarp for 300 ms after dialogue, then starts his walk without delaying every segment', () => {
    const w = createWorld()
    const etarp = {
      id: 'etarp',
      kind: 'npc' as const,
      sprite: 'etarp',
      dialogue: 'test',
      facing: 'left' as const,
      x: 5,
      y: 5,
    }
    w.objects = [etarp]
    const content = structuredClone(c)
    content.dialogues.test.nodes.a.next = 'walk'
    content.dialogues.test.nodes.walk = { walk: { id: 'etarp', path: ['left'] }, next: 'more' }
    content.dialogues.test.nodes.more = { walk: { id: 'etarp', path: ['left'] } }
    apply(w, { type: 'talk', key: 'test' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.objects[0].step).toBeUndefined()
    expect(w.typing).toBeUndefined()
    apply(w, { type: 'tick', dt: 299 }, content)
    apply(w, { type: 'confirm' }, content)
    expect(w.objects[0].step).toBeUndefined()
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.objects[0].step).toEqual({ x: 4, y: 5, t: 0 })
    apply(w, { type: 'tick', dt: 250 }, content)
    expect(etarp.x).toBe(4)
    expect(w.dialogue?.node).toBe('more')
    expect(w.objects[0].step).toEqual({ x: 3, y: 5, t: 0 })
  })
  it('resolves input hints before typewriter timing and preserves the source dialogue', () => {
    const content = structuredClone(c)
    const text = '[PLACEHOLDER press i to open the inventory; press e]'
    content.dialogues.test.nodes.a.text = text
    const w = createWorld()
    w.controls = { confirm: 'Cross', inventory: 'Triangle' }
    apply(w, { type: 'talk', key: 'test' }, content)
    expect(w.typing?.text).toBe('[PLACEHOLDER press Triangle to open the inventory; press Cross]')
    expect(content.dialogues.test.nodes.a.text).toBe(text)
    apply(w, { type: 'confirm' }, content)
    expect(w.typing?.done).toBe(true)
    expect(w.dialogue?.node).toBe('a')
  })
  it('reveals at 14 ms per character, independently of tick size', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'test' }, c)
    expect(w.typing).toMatchObject({ text: '[PLACEHOLDER first]', at: 0 })
    expect(revealed(w.typing!.text, 0)).toBe(0)
    apply(w, { type: 'tick', dt: 90 }, c)
    expect(revealed(w.typing!.text, w.time - w.typing!.at)).toBe(6)
    expect(revealed(w.typing!.text, 99999)).toBe(w.typing!.text.length)
  })

  it('finishes the line on confirm, then advances, without selecting a hidden choice', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'test' }, c)
    apply(w, { type: 'confirm' }, c)
    expect(w.dialogue?.node).toBe('a')
    expect(w.typing?.done).toBe(true)
    apply(w, { type: 'confirm' }, c)
    expect(w.dialogue?.node).toBe('b')
    expect(w.typing?.done).toBeUndefined()
    apply(w, { type: 'confirm' }, c)
    expect(w.flags.picked).toBeUndefined()
    apply(w, { type: 'confirm' }, c)
    expect(w.flags.picked).toBe(true)
    expect(w.typing).toBeUndefined()
    apply(w, { type: 'confirm' }, c)
    expect(w.dialogue?.node).toBe('wait')
    apply(w, { type: 'tick', dt: 100 }, c)
    expect(w.typing?.at).toBe(100)
  })

  it('advances a naturally completed line and keeps scripted interact immediate', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'test' }, c)
    apply(w, { type: 'tick', dt: 1000 }, c)
    apply(w, { type: 'confirm' }, c)
    expect(w.dialogue?.node).toBe('b')
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.node).toBe('wait')
  })

  it('counts complete Unicode characters and preserves progress in snapshots', () => {
    expect(revealed('a\u{1f41a}b', 28)).toBe(3)
    const w = createWorld()
    apply(w, { type: 'talk', key: 'test' }, c)
    apply(w, { type: 'tick', dt: 150 }, c)
    const copy = JSON.parse(JSON.stringify(w))
    expect(revealed(copy.typing.text, copy.time - copy.typing.at)).toBe(10)
  })

  it('shows a pickup immediately, then restarts the reveal for the resumed speaker', () => {
    const content: Content = structuredClone(c)
    content.dialogues.test.nodes.a.give = 'orb'
    content.dialogues.got = {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER {item} {score}]' } },
    }
    const w = createWorld()
    w.flags['name:orb'] = '[PLACEHOLDER renamed]'
    w.score = 15
    apply(w, { type: 'talk', key: 'test' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.typing?.text).toBe('[PLACEHOLDER [PLACEHOLDER renamed] 15]')
    expect(w.typing?.done).toBe(true)
    expect(w.dialogue?.key).toBe('got')
    apply(w, { type: 'tick', dt: 100 }, content)
    apply(w, { type: 'confirm' }, content)
    expect(w.dialogue?.node).toBe('b')
    expect(w.typing).toMatchObject({ at: 100, text: '[PLACEHOLDER second]' })
    expect(w.typing?.done).toBeUndefined()
  })

  it.each([
    { name: '', who: undefined, spoken: false },
    { name: '[PLACEHOLDER NPC NAME]', who: null, spoken: false },
    { name: '[PLACEHOLDER NPC NAME]', who: undefined, spoken: true },
    { name: '', who: '[PLACEHOLDER NPC NAME]', spoken: true },
    { name: '', who: '', spoken: true },
  ])('uses the speaker to decide whether to reveal: %j', ({ name, who, spoken }) => {
    const content = structuredClone(c)
    content.dialogues.test.name = name
    content.dialogues.test.nodes.a = { text: '[PLACEHOLDER line]', who }
    const w = createWorld()
    apply(w, { type: 'talk', key: 'test' }, content)
    expect(!!w.typing?.done).toBe(!spoken)
    expect(w.typing?.who).toBe(who === '' ? 'You' : spoken ? (who ?? name) : '')
    apply(w, { type: 'confirm' }, content)
    expect(w.dialogue?.node ?? null).toBe(spoken ? 'a' : null)
  })
})
