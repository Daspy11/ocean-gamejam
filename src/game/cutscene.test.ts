import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { cancelScene } from './cutscene'
import { createWorld, type Content, type World } from './world'

// mich starts at 13,15; the walk goes right over the player at 15,15 and on down onto tree1 at
// 16,16, so the whole path crosses things a walking player could never cross
const content: Content = {
  dialogues: {
    scene: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: {
        '1': { text: '[PLACEHOLDER scene 1]', next: 'walk' },
        walk: { walk: { id: 'mich', path: ['right', 'right', 'right', 'down'] }, next: 'wait' },
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
  w.player.x = 15
  w.player.y = 15
  apply(w, { type: 'talk', key: 'scene' }, content)
  apply(w, { type: 'interact' }, content)
  return w
}

describe('act nodes', () => {
  it('hides the box while the act runs and ignores interact', () => {
    const w = walking()
    expect(w.dialogue?.node).toBe('walk')
    expect(node(w)?.text).toBeUndefined() // no text: the UI draws no box
    expect(mich(w).step).toEqual({ x: 14, y: 15, t: 0 })

    apply(w, { type: 'tick', dt: 125 }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('walk') // an act cannot be skipped
    expect(mich(w).step?.t).toBeCloseTo(0.5)
  })

  it('walks the npc a tile every 250 ms, through the player and a tree', () => {
    const w = walking()
    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([14, 15])

    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([15, 15]) // straight over the player's tile

    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y]).toEqual([16, 15])

    apply(w, { type: 'tick', dt: 250 }, content)
    expect([mich(w).x, mich(w).y, mich(w).facing]).toEqual([16, 16, 'down']) // and down onto tree1
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
    for (let n = 0; n < 4; n++) apply(w, { type: 'tick', dt: 250 }, content) // the walk
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

const bloomContent: Content = {
  dialogues: {
    plant: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'bloom' }],
      nodes: {
        bloom: { bloom: 'f1', next: 'end' },
        end: { text: '[PLACEHOLDER bloom 1]', next: null },
      },
    },
    ghost: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: 'bloom' }],
      nodes: {
        bloom: { bloom: 'nobody', next: 'end' },
        end: { text: '[PLACEHOLDER bloom 2]', next: null },
      },
    },
  },
  items: {},
}

function flower(w: World) {
  const o = w.objects.find((o) => o.id === 'f1')
  if (o?.kind !== 'flower') throw new Error('f1 is not a flower')
  return o
}
// the flower planted on the grass at 15,16, with the bloom act already open on it
function planted(white = false): World {
  const w = createWorld()
  w.objects.push({ id: 'f1', kind: 'flower', x: 15, y: 16, white })
  apply(w, { type: 'talk', key: 'plant' }, bloomContent)
  return w
}

describe('bloom act', () => {
  it('starts the bloom on the named flower and hides the box', () => {
    const w = planted()
    expect(w.dialogue?.node).toBe('bloom')
    expect(bloomContent.dialogues.plant.nodes.bloom.text).toBeUndefined() // no text: no box
    expect(flower(w).bloomAt).toBe(0)
    expect(flower(w).white).toBe(false)
  })

  it('holds on the bloom node until 1500 ms have passed', () => {
    const w = planted()
    apply(w, { type: 'tick', dt: 1499 }, bloomContent)
    expect(flower(w).white).toBe(false)
    expect(w.score).toBe(0)
    expect(w.pops).toEqual([])
    expect(w.dialogue?.node).toBe('bloom')
  })

  it('turns white at 1500 ms, scores 10 with a pop, and moves the dialogue on', () => {
    const w = planted()
    const rev = w.rev
    apply(w, { type: 'tick', dt: 1500 }, bloomContent)
    expect(flower(w).white).toBe(true)
    expect(w.score).toBe(10)
    expect(w.pops).toEqual([{ x: 15, y: 16, text: '+10', at: 1500 }])
    expect(w.rev).toBeGreaterThan(rev)
    expect(w.dialogue?.node).toBe('end')
  })

  it('never scores a flower that is already white', () => {
    const w = planted(true)
    for (let n = 0; n < 20; n++) apply(w, { type: 'tick', dt: 200 }, bloomContent)
    expect(w.score).toBe(0)
    expect(w.pops).toEqual([])
  })

  it('does not hang on a bloom naming a flower that is not there', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'ghost' }, bloomContent)
    expect(w.dialogue?.node).toBe('bloom')
    apply(w, { type: 'tick', dt: 16 }, bloomContent)
    expect(w.dialogue?.node).toBe('end')
  })
})

// the flower scene's `eat` node: one line, and it costs the player the electrolytes it names
const eatContent: Content = {
  dialogues: {
    eat: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER eat 1]', take: 'electrolytes', next: null } },
    },
  },
  items: {},
}

describe('a node that takes an item', () => {
  it('spends one as the node opens, and the slot goes with the last of them', () => {
    const w = createWorld()
    w.inventory.electrolytes = 1
    const rev = w.rev
    apply(w, { type: 'talk', key: 'eat' }, eatContent)
    expect(w.inventory).toEqual({}) // the key itself is gone, so the inventory screen has no slot
    expect(w.rev).toBeGreaterThan(rev)
  })

  it('never takes the count below none', () => {
    const w = createWorld()
    apply(w, { type: 'talk', key: 'eat' }, eatContent)
    expect(w.inventory.electrolytes).toBeUndefined()
    apply(w, { type: 'interact' }, eatContent) // close it, then play it again on an empty bag
    apply(w, { type: 'talk', key: 'eat' }, eatContent)
    expect(w.inventory).toEqual({})
  })
})

// a scene that waits on an npc: talking to mich fires talk:mich before her own lines get a look in
const talkContent: Content = {
  dialogues: {
    mich: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER mich 1]', next: null } },
    },
    cutin: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'talk:mich', when: 'had:x' },
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER cutin 1]', next: null } },
    },
  },
  items: {},
}

// on the sand at 13,14, facing mich at 13,15
function atMich(flag = false): World {
  const w = createWorld()
  w.player.x = 13
  w.player.y = 14
  w.player.facing = 'down'
  if (flag) w.flags['had:x'] = true
  return w
}

describe('the talk:<npc id> event', () => {
  it('opens the npc own dialogue while the scene is not due', () => {
    const w = atMich()
    apply(w, { type: 'interact' }, talkContent)
    expect(w.dialogue?.key).toBe('mich')
    expect(mich(w).facing).toBe('up')
  })

  it('lets a due scene cut in instead, and still turns the npc', () => {
    const w = atMich(true)
    apply(w, { type: 'interact' }, talkContent)
    expect(w.dialogue?.key).toBe('cutin')
    expect(w.flags['fired:cutin']).toBe(true)
    expect(w.queue).toEqual([]) // it cut in, so her own lines never queued up behind it
    expect(mich(w).facing).toBe('up')
  })

  it('goes back to the npc own dialogue once the scene has played', () => {
    const w = atMich(true)
    apply(w, { type: 'interact' }, talkContent)
    apply(w, { type: 'interact' }, talkContent) // close the scene
    expect(w.dialogue).toBe(null)

    apply(w, { type: 'interact' }, talkContent)
    expect(w.dialogue?.key).toBe('mich')
  })
})

// the debug menu warps out from under a cutscene, so the scene has to be dropped where it stands
describe('cancelScene', () => {
  it('closes the box, empties the queue and stops everyone mid-walk', () => {
    const w = walking()
    w.queue.push({ key: 'run' })
    w.rumble = 2000
    apply(w, { type: 'tick', dt: 100 }, content)
    expect(mich(w).step).not.toBe(null)

    const rev = w.rev
    cancelScene(w)
    expect(w.dialogue).toBe(null)
    expect(w.queue).toEqual([])
    expect(w.rumble).toBe(0)
    expect(mich(w)).toMatchObject({ x: 13, y: 15, step: null, path: [] })
    expect(w.rev).toBeGreaterThan(rev)

    // and nothing starts up again on the next tick: the walk act is gone, not paused
    apply(w, { type: 'tick', dt: 1000 }, content)
    expect(w.dialogue).toBe(null)
    expect(mich(w)).toMatchObject({ x: 13, y: 15, step: null })
  })
})
