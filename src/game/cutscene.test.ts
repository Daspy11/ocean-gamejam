import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

// mich starts at 13,15; the walk goes up to 13,14 then right over the player at 14,14 and on to
// tree1 at 15,14, so the whole path crosses things a walking player could never cross
const content: Content = {
  dialogues: {
    scene: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER scene 1]', next: 'walk' },
        walk: { walk: { id: 'mich', path: ['up', 'right', 'right'] }, next: 'wait' },
        wait: { wait: 500, next: 'spawn' },
        spawn: { spawn: { id: 'tree2', kind: 'tree', x: 18, y: 12 }, next: 'end' },
        end: { text: '[PLACEHOLDER scene 2]', next: null },
      },
    },
    run: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'walk' }],
      nodes: {
        walk: { walk: { id: 'mich', path: ['up'], run: true }, next: 'end' },
        end: { text: '[PLACEHOLDER run 1]', next: null },
      },
    },
    ghost: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'walk' }],
      nodes: {
        walk: { walk: { id: 'nobody', path: ['up'] }, next: 'end' },
        end: { text: '[PLACEHOLDER ghost 1]', next: null },
      },
    },
  },
  items: {},
}

function mich(w: World) {
  const o = w.objects.find((o) => o.id === 'mich')
  if (o?.kind !== 'npc') throw new Error('mich is not an npc')
  return o
}
const node = (w: World) =>
  w.dialogue ? content.dialogues[w.dialogue.key].nodes[w.dialogue.node] : undefined

// the scene opened and stepped past its first line, so the walk act is running
function walking(): World {
  const w = createWorld()
  w.player.x = 14
  w.player.y = 14
  apply(w, { type: 'talk', key: 'scene' }, content)
  apply(w, { type: 'interact' }, content)
  return w
}

describe('act nodes', () => {
  it('hides the box while the act runs and ignores interact', () => {
    const w = walking()
    expect(w.dialogue?.node).toBe('walk')
    expect(node(w)?.text).toBeUndefined() // no text: the UI draws no box
    expect(mich(w).step).toEqual({ x: 13, y: 14, t: 0 })

    apply(w, { type: 'tick', dt: 125 }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('walk') // an act cannot be skipped
    expect(mich(w).step?.t).toBeCloseTo(0.5)
  })

  it('walks the npc a tile every 250 ms, through the player and a tree', () => {
    const w = walking()
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([13, 14])

    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([14, 14]) // straight over the player's tile

    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y, mich(w).facing]).toEqual([15, 14, 'right']) // and over tree1
    expect(mich(w).step).toBe(null)
    expect(w.dialogue?.node).toBe('wait') // arrived, so the node moved on by itself
  })

  it('runs a walk at 125 ms a tile', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'run' }, content)
    apply(w, { type: 'tick', dt: 125 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([13, 14])
    expect(w.dialogue?.node).toBe('end') // the walk was over inside this same tick
  })

  it('holds on a wait until the time has passed, then spawns once and closes', () => {
    const w = walking()
    for (let n = 0; n < 3; n++) apply(w, { type: 'tick', dt: 250 }, content) // the walk
    expect(w.dialogue?.node).toBe('wait')

    apply(w, { type: 'tick', dt: 400 }, content)
    expect(w.dialogue?.node).toBe('wait')
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(w.dialogue?.node).toBe('spawn')
    expect(w.objects.filter((o) => o.id === 'tree2')).toHaveLength(1)

    apply(w, { type: 'tick', dt: 16 }, content) // a spawn is done the moment it opens
    expect(w.dialogue?.node).toBe('end')
    expect(node(w)?.text).toBe('[PLACEHOLDER scene 2]')

    apply(w, { type: 'interact' }, content) // a text node still closes on interact
    expect(w.dialogue).toBe(null)
  })

  it('never spawns the same object twice', () => {
    const w = createWorld()
    for (let i = 0; i < 2; i++) {
      apply(w, { type: 'talk', key: 'scene' }, content)
      apply(w, { type: 'interact' }, content) // into the walk
      for (let n = 0; n < 20; n++) apply(w, { type: 'tick', dt: 100 }, content)
      apply(w, { type: 'interact' }, content) // close the last line
    }
    expect(w.objects.filter((o) => o.id === 'tree2')).toHaveLength(1)
  })

  it('does not hang on a walk naming an npc that is not there', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'ghost' }, content)
    expect(w.dialogue?.node).toBe('walk')
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.dialogue?.node).toBe('end')
  })
})
