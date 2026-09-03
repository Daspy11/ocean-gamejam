import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

// the shape of the five tree files: tree.json asks, shake3/shake7 are Mich's asides, treealive is
// the tree speaking up on the twelfth shake, and treefriend the reunion a minute after the promise
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    tree: {
      name: '',
      start: [{ when: 'tree:promised', node: 'ask2' }, { node: 'ask' }],
      nodes: {
        ask: {
          text: '[PLACEHOLDER tree ask]',
          choices: [
            { text: '[PLACEHOLDER yes]', next: 'shake' },
            { text: '[PLACEHOLDER no]', next: null },
          ],
        },
        shake: { shake: 'tree1', next: null },
        ask2: {
          text: '[PLACEHOLDER tree ask2]',
          choices: [
            { text: '[PLACEHOLDER yes]', next: 'lied' },
            { text: '[PLACEHOLDER no]', next: null },
          ],
        },
        lied: { who: '[PLACEHOLDER NPC NAME]', text: '[PLACEHOLDER tree lied]', next: 'fly' },
        fly: { fly: 'tree1', next: null },
      },
    },
    shake3: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'tree:shake:3' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER shake3 1]', next: null } },
    },
    shake7: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'tree:shake:7' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER shake7 1]', next: null } },
    },
    treealive: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'tree:shake:12' },
      start: [{ node: '1' }],
      nodes: {
        '1': {
          text: '[PLACEHOLDER treealive 1]',
          choices: [
            { text: '[PLACEHOLDER no]', next: 'no' },
            { text: '[PLACEHOLDER yes]', next: 'yes' },
          ],
        },
        no: { text: '[PLACEHOLDER treealive no]', next: 'fly' },
        fly: { fly: 'tree1', next: 'gone' },
        gone: { who: '[PLACEHOLDER NPC NAME]', text: '[PLACEHOLDER treealive gone]', next: null },
        yes: {
          text: '[PLACEHOLDER treealive yes]',
          set: { 'tree:promised': true },
          next: null,
        },
      },
    },
    treefriend: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'tree:near', when: 'tree:promised' },
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER treefriend 1]', next: '2' },
        '2': { spawn: { id: 'tree2', kind: 'tree', x: 15, y: 19 }, next: '3' },
        '3': { land: 'tree2', next: '4' },
        '4': { who: '[PLACEHOLDER NPC NAME]', text: '[PLACEHOLDER treefriend 4]', next: '5' },
        '5': { text: '[PLACEHOLDER treefriend 5]', next: '6' },
        '6': { text: '[PLACEHOLDER treefriend 6]', next: null },
      },
    },
  },
  items: { twig: { name: '[PLACEHOLDER twig]' } },
}

function tree1(w: World) {
  const o = w.objects.find((o) => o.id === 'tree1')
  if (o?.kind !== 'tree') throw new Error('tree1 is not a tree')
  return o
}
const gone = (w: World, id: string) => !w.objects.some((o) => o.id === id)
// key and node together: the got box and Mich's asides all start on a node '1'
const at = (w: World) => (w.dialogue ? `${w.dialogue.key}/${w.dialogue.node}` : null)

// on the grass at 15,15, looking up at tree1 at 15,14
function atTree(): World {
  const w = createWorld()
  w.player.x = 15
  w.player.y = 15
  w.player.facing = 'up'
  return w
}
// open the box, say yes, and let the shake act close itself; whatever it queued is left on screen
function shake(w: World) {
  apply(w, { type: 'interact' }, content)
  apply(w, { type: 'interact' }, content)
  apply(w, { type: 'tick', dt: 400 }, content)
}
function dismiss(w: World) {
  for (let n = 0; n < 4 && w.dialogue; n++) apply(w, { type: 'interact' }, content)
}
// every shake up to and including `n`, with the last one's box left open
function shakes(w: World, n: number) {
  for (let i = 1; i <= n; i++) {
    shake(w)
    if (i < n) dismiss(w)
  }
}

describe('shaking the tree', () => {
  it('opens the tree box, and yes shakes a twig out of it', () => {
    const w = atTree()
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toMatchObject({ key: 'tree', node: 'ask', choice: 0 })

    apply(w, { type: 'interact' }, content) // the first choice is yes
    expect(at(w)).toBe('tree/shake')
    expect(w.inventory.twig).toBe(1)
    expect(tree1(w)).toMatchObject({ shakes: 1, shookAt: 0 })
    expect(w.queue).toEqual([{ key: 'got', item: 'twig' }]) // it waits for the tree's own box

    apply(w, { type: 'tick', dt: 400 }, content)
    expect(at(w)).toBe('got/1') // the shake act is over at once, so the got box is next in
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
  })

  it('lets Mich chip in on the third shake and the seventh, once each', () => {
    const w = atTree()
    for (let n = 1; n <= 7; n++) {
      shake(w)
      if (n === 1) expect(at(w)).toBe('got/1')
      else if (n === 3) expect(at(w)).toBe('shake3/1')
      else if (n === 7) expect(at(w)).toBe('shake7/1')
      else expect(w.dialogue).toBe(null) // a line that has played never comes back
      dismiss(w)
    }
    expect(tree1(w)).toMatchObject({ shakes: 7 })
    expect(w.inventory.twig).toBe(7)
  })

  it('has the tree speak up on the twelfth, and flies it away when told no', () => {
    const w = atTree()
    shakes(w, 12)
    expect(at(w)).toBe('treealive/1')

    apply(w, { type: 'interact' }, content) // the first choice is no
    expect(at(w)).toBe('treealive/no')
    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('treealive/fly')
    expect(tree1(w).flyAt).toBe(w.time)

    apply(w, { type: 'tick', dt: 1499 }, content)
    expect(gone(w, 'tree1')).toBe(false)
    expect(at(w)).toBe('treealive/fly') // still climbing, so the box stays hidden
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(gone(w, 'tree1')).toBe(true)
    expect(at(w)).toBe('treealive/gone')

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)
    const rev = w.rev
    apply(w, { type: 'interact' }, content) // nothing there to face any more
    expect(w.dialogue).toBe(null)
    expect(w.rev).toBe(rev)
  })

  it('takes the promise, then flies off when the promise is broken', () => {
    const w = atTree()
    shakes(w, 12)
    apply(w, { type: 'move', dir: 'down' }, content) // down the choices to yes
    apply(w, { type: 'move', dir: null }, content)
    expect(w.dialogue?.choice).toBe(1)

    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('treealive/yes')
    expect(w.flags['tree:promised']).toBe(true)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('tree/ask2') // the promise picks the other start
    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('tree/lied')
    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('tree/fly')
    apply(w, { type: 'tick', dt: 1500 }, content)
    expect(gone(w, 'tree1')).toBe(true)
    expect(w.dialogue).toBe(null)
  })
})

// promised, with tree1 last shaken at time 0 and the player `y` tiles down the grass from it
function promised(y: number): World {
  const w = atTree()
  w.player.y = y
  w.flags['tree:promised'] = true
  tree1(w).shookAt = 0
  return w
}
const minute = (w: World) => {
  for (let n = 0; n < 60; n++) apply(w, { type: 'tick', dt: 1000 }, content)
}

describe('the tree that was left alone', () => {
  it('says nothing for the first minute, even from the next tile', () => {
    const w = promised(15)
    for (let n = 0; n < 59; n++) apply(w, { type: 'tick', dt: 1000 }, content)
    expect(w.dialogue).toBe(null)
    expect(w.flags['fired:treefriend']).toBeUndefined()

    apply(w, { type: 'tick', dt: 1000 }, content)
    expect(at(w)).toBe('treefriend/1')
  })

  it('stays quiet four tiles away and calls out once the player is three', () => {
    const w = promised(18)
    minute(w)
    expect(w.dialogue).toBe(null)

    w.player.y = 17 // one step closer: three tiles from the tree
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(at(w)).toBe('treefriend/1')
  })

  it('spawns the friend and lands it over 1500 ms, and never plays twice', () => {
    const w = promised(17)
    minute(w)
    expect(at(w)).toBe('treefriend/1')

    apply(w, { type: 'interact' }, content)
    expect(at(w)).toBe('treefriend/2')
    expect(w.objects.find((o) => o.id === 'tree2')).toMatchObject({ kind: 'tree', x: 15, y: 19 })

    apply(w, { type: 'tick', dt: 16 }, content) // a spawn is done the moment it opens
    expect(at(w)).toBe('treefriend/3')
    expect(w.objects.find((o) => o.id === 'tree2')).toMatchObject({ landAt: w.time })

    apply(w, { type: 'tick', dt: 1499 }, content)
    expect(at(w)).toBe('treefriend/3') // still coming down
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(at(w)).toBe('treefriend/4')

    for (const node of ['5', '6']) {
      apply(w, { type: 'interact' }, content)
      expect(at(w)).toBe(`treefriend/${node}`)
    }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toBe(null)

    w.player.y = 18 // away and back again: the reunion only ever happens once
    apply(w, { type: 'tick', dt: 1000 }, content)
    w.player.y = 17
    apply(w, { type: 'tick', dt: 1000 }, content)
    expect(w.dialogue).toBe(null)
  })
})
