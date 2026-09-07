import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

const content: Content = {
  dialogues: {
    mich: {
      name: 'Mich',
      start: [{ when: 'mich_met', node: 'again' }, { node: 'greet' }],
      nodes: {
        greet: {
          text: '[PLACEHOLDER greeting]',
          choices: [
            { text: '[PLACEHOLDER choice A]', next: 'a', set: { mich_met: true, mich_choice: 1 } },
            { text: '[PLACEHOLDER choice B]', next: 'b', set: { mich_met: true, mich_choice: 2 } },
          ],
        },
        a: { text: '[PLACEHOLDER reply A]', next: null },
        b: { text: '[PLACEHOLDER reply B]', next: null },
        again: { text: '[PLACEHOLDER repeat greeting]', next: null },
      },
    },
    // the shape of assets/dialogue/landing.json: six nodes on a chain, node 2 has no speaker name
    landing: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER landing 1]', next: '2' },
        '2': { who: '', text: '[PLACEHOLDER landing 2]', next: '3' },
        '3': { text: '[PLACEHOLDER landing 3]', next: '4' },
        '4': { text: '[PLACEHOLDER landing 4]', next: '5' },
        '5': { text: '[PLACEHOLDER landing 5]', next: '6' },
        '6': { text: '[PLACEHOLDER landing 6]', next: null },
      },
    },
    // the shape of assets/dialogue/sign.json: one line, and no speaker name to draw
    sign: { name: '', start: [{ node: '1' }], nodes: { '1': { text: '[PLACEHOLDER sign 1]' } } },
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    // the tutorial chain: each beat plays once, on an event, after the beat before it has played
    crate: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'crate:open' },
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER crate 1]', next: '2' },
        '2': { who: '', text: '[PLACEHOLDER crate 2]', next: null },
      },
    },
    inventory1: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'menu:close', when: 'fired:crate' },
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER inventory1 1]', next: '2' },
        '2': {
          text: '[PLACEHOLDER inventory1 2]',
          set: { 'name:orb': '[PLACEHOLDER shorter orb]' },
          next: null,
        },
      },
    },
    inventory2: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'menu:close', when: 'fired:inventory1' },
      start: [{ node: '1' }],
      nodes: {
        '1': {
          text: '[PLACEHOLDER inventory2 1]',
          set: { 'name:orb': '[PLACEHOLDER shortest orb]' },
          next: null,
        },
      },
    },
    // the shape of assets/dialogue/flower.json: only crate2's contents make its `when` flag true
    flower: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'crate:open', when: 'had:electrolytes' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER flower 1]', next: null } },
    },
  },
  items: {
    salt: { name: '[PLACEHOLDER salt]' },
    orb: { name: '[PLACEHOLDER orb]' },
    electrolytes: { name: '[PLACEHOLDER electrolytes]' },
  },
}

// east of mich (13,17), facing her
function atNpc(): World {
  const w = createWorld()
  w.player.x = 14
  w.player.y = 17
  w.player.facing = 'left'
  return w
}

describe('talking to an npc', () => {
  it('turns the npc to face the player when the dialogue opens', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('mich')
    expect(w.objects.find((o) => o.kind === 'npc')?.facing).toBe('right')
  })

  it('runs a choice route and reopens on the flag route', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'mich', node: 'greet', choice: 0 })

    apply(w, { type: 'move', dir: 'down' }, content)
    expect(w.dialogue?.choice).toBe(1)

    apply(w, { type: 'interact' }, content)
    expect(w.flags).toEqual({ mich_met: true, mich_choice: 2 })
    expect(w.dialogue?.node).toBe('b')

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('again')
  })

  it('clamps the choice cursor, ignores left/right and never moves the player', () => {
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
    expect(w.player.facing).toBe('left') // the box swallowed the move, so the player never turned

    apply(w, { type: 'tick', dt: 300 }, content)
    expect(w.player.step).toBe(null) // a held key does not walk during a dialogue

    apply(w, { type: 'move', dir: null }, content) // release while the box is open
    apply(w, { type: 'interact' }, content) // choose B
    apply(w, { type: 'interact' }, content) // close
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y, w.player.step]).toEqual([14, 17, null])
  })

  it('swallows the inventory key while the box is open', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'menu' }, content)
    expect(w.menu).toBe(null)
  })

  it('closes instead of throwing on missing content', () => {
    const w = atNpc()
    apply(w, { type: 'interact' }, { dialogues: {}, items: {} })
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    w.dialogue = { key: 'mich', node: 'nope', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })
})

describe('talk', () => {
  it('opens the landing dialogue mid-step and walks it node by node to the end', () => {
    const w = createWorld()
    apply(w, { type: 'move', dir: 'right' }, content)
    apply(w, { type: 'tick', dt: 100 }, content) // a scripted line does not wait for the step
    expect(w.player.step).not.toBe(null)

    apply(w, { type: 'talk', key: 'landing' }, content)
    expect(w.dialogue).toEqual({ key: 'landing', node: '1', choice: 0 })
    for (const node of ['2', '3', '4', '5', '6', null]) {
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue?.node ?? null).toBe(node)
    }
  })

  it('is ignored during a dialogue, in the menu, and on an unknown key', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'landing' }, content)
    apply(w, { type: 'talk', key: 'mich' }, content)
    expect(w.dialogue).toEqual({ key: 'landing', node: '1', choice: 0 })

    const v = createWorld()
    apply(v, { type: 'menu' }, content)
    apply(v, { type: 'talk', key: 'landing' }, content)
    expect(v.dialogue).toBe(null)

    const u = createWorld()
    const before = u.rev
    apply(u, { type: 'talk', key: 'nope' }, content)
    expect(u.dialogue).toBe(null)
    expect(u.rev).toBe(before)
  })
})

// standing east of orb1 at 13,15 and facing it is the whole of the first tutorial beat
function atCrate(): World {
  const w = createWorld()
  w.player.x = 14
  w.player.y = 15
  w.player.facing = 'left'
  return w
}

// walks the crate beat and both inventory beats, leaving the box closed
function tutorial(w: World) {
  for (let i = 0; i < 4; i++) apply(w, { type: 'interact' }, content) // got box, then Mich
  for (const beats of [2, 1]) {
    apply(w, { type: 'menu' }, content)
    apply(w, { type: 'menu' }, content)
    for (let i = 0; i < beats; i++) apply(w, { type: 'interact' }, content)
  }
}

// crate2 sits on the far island's grass at 24,17; 23,17 is the sand just west of it
function atCrate2(): World {
  const w = createWorld()
  w.player.x = 23
  w.player.y = 17
  w.player.facing = 'right'
  return w
}

describe('the second crate', () => {
  it('hands over the electrolytes once, with the flower scene queued behind the got box', () => {
    const w = atCrate2()
    apply(w, { type: 'interact' }, content)
    expect(w.inventory).toEqual({ electrolytes: 1 })
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'electrolytes' })
    expect(w.queue).toEqual([{ key: 'crate' }, { key: 'flower' }])
    expect(w.flags['fired:flower']).toBe(true)

    const crate = w.objects.find((o) => o.id === 'crate2')
    expect(crate?.kind === 'crate' && crate.open).toBe(true)
    apply(w, { type: 'interact' }, content) // the got box goes, the queue takes over
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('flower')

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
    apply(w, { type: 'interact' }, content) // an open crate is empty
    expect(w.inventory).toEqual({ electrolytes: 1 })
    expect(w.dialogue).toBe(null)
  })

  it('leaves the flower scene alone when the crate by the wreck is the one opened', () => {
    const w = atCrate()
    apply(w, { type: 'interact' }, content)
    expect(w.inventory).toEqual({ orb: 1 })
    expect(w.dialogue?.item).toBe('orb')
    expect(w.queue).toEqual([{ key: 'crate' }]) // had:electrolytes is unset, so flower is not due
    expect(w.flags['fired:flower']).toBeUndefined()
  })
})

describe('the scripted tutorial', () => {
  it('shows the got box first and queues the triggered line behind it', () => {
    const w = atCrate()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'orb' })
    expect(w.queue).toEqual([{ key: 'crate' }])
    expect(w.flags['fired:crate']).toBe(true)
    expect(w.flags['had:orb']).toBe(true)

    apply(w, { type: 'interact' }, content) // dismissing it hands the box to the queue
    expect(w.dialogue).toEqual({ key: 'crate', node: '1', choice: 0 })
    expect(w.queue).toEqual([])
  })

  it('runs the menu:close beats in order and lets each one rename the orb', () => {
    const w = atCrate()
    apply(w, { type: 'interact' }, content)
    for (let i = 0; i < 3; i++) apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'menu' }, content)
    apply(w, { type: 'menu' }, content) // fired:crate is set, so the first beat is due
    expect(w.dialogue?.key).toBe('inventory1')
    apply(w, { type: 'interact' }, content)
    expect(w.flags['name:orb']).toBe('[PLACEHOLDER shorter orb]')
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'menu' }, content)
    apply(w, { type: 'menu' }, content)
    expect(w.dialogue?.key).toBe('inventory2') // the first beat has fired, so the second wins
    expect(w.flags['name:orb']).toBe('[PLACEHOLDER shortest orb]')
  })

  it('never fires a trigger twice', () => {
    const w = atCrate()
    apply(w, { type: 'interact' }, content)
    tutorial(w)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'menu' }, content)
    apply(w, { type: 'menu' }, content) // both beats have played, so nothing opens
    expect(w.dialogue).toBe(null)
    expect(w.queue).toEqual([])
  })

  it('drains the queue in order', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'landing' }, content)
    w.queue.push({ key: 'mich' }, { key: 'crate' })
    for (const node of ['2', '3', '4', '5', '6']) {
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue?.node).toBe(node)
    }

    apply(w, { type: 'interact' }, content) // landing ends, so the first queued line takes the box
    expect(w.dialogue?.key).toBe('mich')
    apply(w, { type: 'interact' }, content) // choice A
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('crate')
    expect(w.queue).toEqual([])
  })
})

describe('reading a sign', () => {
  it('opens its dialogue with no speaker name and closes on a second interact', () => {
    const w = createWorld() // south of sign1 (25,16) on the second island, looking at it
    w.player = { ...w.player, x: 25, y: 17, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'sign', node: '1', choice: 0 })
    expect(content.dialogues.sign.name).toBe('') // no one is speaking: the box draws no name
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })
})
