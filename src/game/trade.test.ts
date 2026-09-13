import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, objectAt, tileAt, type Content, type World } from './world'

// A dialogue that reads the bag and pays out of it: `has` on a branch, a record `take`, a `give`.
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    // the shape of assets/dialogue/albatross.json: a `has` branch, a record `take` and a `give`
    albatross: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ when: 'albatross:egg', node: 'after' }, { node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER albatross 1]', next: '2' },
        '2': {
          who: '',
          text: '[PLACEHOLDER albatross 2]',
          next: [{ has: { twig: 10 }, node: '3twigs' }, { node: '3' }],
        },
        '3': { text: '[PLACEHOLDER albatross 3]', next: null },
        '3twigs': {
          text: '[PLACEHOLDER albatross 3]',
          choices: [
            { text: '[PLACEHOLDER choice A]', next: null },
            { text: '[PLACEHOLDER choice B]', next: '4' },
          ],
        },
        '4': { text: '[PLACEHOLDER albatross 4]', next: '5' },
        '5': {
          text: '[PLACEHOLDER albatross 5]',
          take: { twig: 10 },
          give: 'egg',
          set: { 'albatross:egg': true },
          next: null,
        },
        after: { text: '[PLACEHOLDER albatross after]', next: null },
      },
    },
    // a give with more to say after it: the got box cuts in, then the talk carries on
    gifter: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER gifter 1]', give: 'egg', next: '2' },
        '2': { text: '[PLACEHOLDER gifter 2]', next: null },
      },
    },
  },
  items: { twig: { name: '[PLACEHOLDER twig]' }, egg: { name: '[PLACEHOLDER egg]' } },
}

// south of the albatross at 36,20 on the big island, looking up at him
function atBird(twigs: number): World {
  const w = createWorld()
  w.player = { ...w.player, x: 36, y: 21, facing: 'up' }
  w.inventory.twig = twigs
  return w
}

// through his first two lines to wherever the `has` branch sends the third
function toBranch(w: World) {
  apply(w, { type: 'interact' }, content)
  apply(w, { type: 'interact' }, content)
  apply(w, { type: 'interact' }, content)
}

describe('an npc who wants ten twigs', () => {
  it('wanders inside the same 4x4 patch with 4–8 second pauses, reproducibly after saving', () => {
    const w = createWorld()
    const bird = w.objects.find((o) => o.id === 'albatross')!
    const visited = new Set<string>()
    const pauses = new Set<number>()
    for (let i = 0; i < 3000; i++) {
      const moving = !!bird.step
      apply(w, { type: 'tick', dt: 100 }, content)
      for (const p of [bird, ...(bird.step ? [bird.step] : [])]) {
        expect(p.x).toBeGreaterThanOrEqual(34)
        expect(p.x).toBeLessThan(38)
        expect(p.y).toBeGreaterThanOrEqual(19)
        expect(p.y).toBeLessThan(23)
        expect(['water', 'rock']).not.toContain(tileAt(w, p.x, p.y))
        expect(objectAt(w, p.x, p.y)?.id ?? bird.id).toBe(bird.id)
      }
      visited.add(`${bird.x},${bird.y}`)
      if (moving && !bird.step && bird.kind === 'npc') {
        const wait = bird.wander!.wait!
        expect(wait).toBeGreaterThanOrEqual(4000)
        expect(wait).toBeLessThanOrEqual(8000)
        pauses.add(wait)
      }
    }
    expect(visited.size).toBeGreaterThan(4)
    expect(pauses.size).toBeGreaterThan(4)
    const saved: World = JSON.parse(JSON.stringify(w))
    for (let i = 0; i < 200; i++) {
      apply(w, { type: 'tick', dt: 100 }, content)
      apply(saved, { type: 'tick', dt: 100 }, content)
    }
    expect(JSON.parse(JSON.stringify(w))).toEqual(saved)
  })

  it.each([false, true])(
    'pauses for conversation and inventory, and avoids a player step: %s',
    (stepping) => {
      const w = atBird(0)
      const bird = w.objects.find((o) => o.id === 'albatross')!
      apply(w, { type: 'interact' }, content)
      const stopped = structuredClone(bird)
      apply(w, { type: 'tick', dt: 20000 }, content)
      expect(bird).toEqual(stopped)
      w.dialogue = null
      w.menu = { screen: 'inventory', cursor: 0 }
      apply(w, { type: 'tick', dt: 20000 }, content)
      expect(bird).toEqual(stopped)
      w.menu = null
      for (let i = 0; i < 100 && !bird.step; i++) apply(w, { type: 'tick', dt: 100 }, content)
      expect(bird.step).toBeTruthy()
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue).toMatchObject({ key: 'albatross' })
      const midStep = structuredClone(bird)
      apply(w, { type: 'tick', dt: 20000 }, content)
      expect(bird).toEqual(midStep)
      w.dialogue = null
      const target = { x: bird.step!.x, y: bird.step!.y }
      if (stepping) w.player.step = { ...target, t: 0 }
      else Object.assign(w.player, target)
      apply(w, { type: 'tick', dt: stepping ? 1 : 250 }, content)
      expect(bird.step).toBeNull()
      expect([bird.x, bird.y]).not.toEqual([target.x, target.y])
    },
  )

  it('branches on what is in the bag', () => {
    const w = atBird(10)
    toBranch(w)
    expect(w.dialogue?.node).toBe('3twigs')

    const few = atBird(9) // one short: the same line, without the offer
    toBranch(few)
    expect(few.dialogue?.node).toBe('3')
  })

  it('takes all ten and hands over the egg, with the got box behind his line', () => {
    const w = atBird(10)
    toBranch(w)
    apply(w, { type: 'move', dir: 'down' }, content) // the second choice: offer the twigs
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)

    expect(w.dialogue?.node).toBe('5')
    expect(w.inventory.twig).toBeUndefined() // the slot goes with the last twig
    expect(w.inventory.egg).toBe(1)
    expect(w.flags['had:egg']).toBe(true)
    expect(w.queue).toEqual([{ key: 'got', item: 'egg' }])

    apply(w, { type: 'interact' }, content) // his line done, the got box takes over
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'egg' })
  })

  it('sends the visit after that to his after node', () => {
    const w = atBird(10)
    w.flags['albatross:egg'] = true
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('after')
    expect(w.inventory.twig).toBe(10) // nothing is spent on the way through
  })

  it('shows the got box straight after a give that has more to say, then carries on', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'gifter' }, content)
    expect(w.queue).toEqual([{ key: 'got', item: 'egg' }])
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({
      key: 'got',
      node: '1',
      choice: 0,
      item: 'egg',
      back: { key: 'gifter', node: '2' },
    })
    expect(w.queue).toEqual([])
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toMatchObject({ key: 'gifter', node: '2' }) // back where he left off
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBeNull()
  })
})
