import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { MAPS } from './map'
import { createWorld, objectAt, tileAt, type Content, type World } from './world'

// the shrimp's field: the lines are his, the got box is the sim's
const content: Content = {
  dialogues: {
    got: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER got {item}]', next: null } },
    },
    // the shape of assets/dialogue/shrimp.json: twelve carrots across his gate get his thanks and
    // the chair he wants next, and a chair the award
    shrimp: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [
        { when: 'shrimp:thanked', node: 'after' },
        { when: 'shrimp:chair', has: { chair: 1 }, node: 'chair' },
        { when: 'shrimp:chair', node: 'nochair' },
        { when: 'shrimp:asked', has: { carrot: 12 }, node: 'carrots' },
        { node: '1' },
      ],
      nodes: {
        '1': { text: '[PLACEHOLDER the farmer asks]', next: null },
        carrots: {
          text: '[PLACEHOLDER the farmer is grateful]',
          take: { carrot: 12 },
          next: 'askchair',
        },
        askchair: {
          text: '[PLACEHOLDER the farmer wants a chair]',
          set: { 'shrimp:chair': true },
          next: null,
        },
        nochair: { text: '[PLACEHOLDER the farmer wants a chair]', next: null },
        chair: {
          text: '[PLACEHOLDER the farmer is grateful]',
          take: 'chair',
          give: 'certificate',
          set: { 'shrimp:thanked': true },
          next: null,
        },
        after: { text: '[PLACEHOLDER the farmer is grateful]', next: null },
      },
    },
    // what the field reads out before he has asked for a hand with it
    carrotfield: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER someone else grows these]', next: null } },
    },
  },
  items: { carrot: { name: '[PLACEHOLDER carrot]' } },
}

// on a grass gap in the field, facing the carrot beside him, with the farmer's ask already heard
function atField(x: number, y: number, facing: 'left' | 'right'): World {
  const w = createWorld()
  w.player = { ...w.player, x, y, facing }
  w.flags['shrimp:asked'] = true
  return w
}

describe('the carrot field', () => {
  it('plants one carrot per F, fences the field and sits the farmer over the gate', () => {
    const w = createWorld()
    const sown = MAPS.island.reduce((n, row) => n + [...row].filter((c) => c === 'F').length, 0)
    expect(w.objects.filter((o) => o.kind === 'carrot').length).toBe(sown)
    expect(objectAt(w, 47, 17)?.id).toBe('carrot47-17')
    expect(tileAt(w, 47, 17)).toBe('farm')
    expect(objectAt(w, 45, 15)?.id).toBe('fence45-15') // the ring's north-west corner
    expect(objectAt(w, 49, 15)).toBeUndefined() // the gate, the one way in
    expect(objectAt(w, 49, 13)?.id).toBe('shrimp')
  })

  it('walks in through the gate, but not through the fence beside it', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 48, y: 14, facing: 'down' }
    apply(w, { type: 'move', dir: 'down' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y, w.player.step]).toEqual([48, 14, null])

    w.player = { ...w.player, x: 49, y: 14 }
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y]).toEqual([49, 15])
  })

  it('reads the field out rather than picking it before he has asked', () => {
    const w = atField(48, 17, 'left')
    delete w.flags['shrimp:asked']
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('carrotfield')
    expect(objectAt(w, 47, 17)?.id).toBe('carrot47-17') // still in the ground
    expect(w.inventory.carrot).toBeUndefined()
  })

  it('walks the tilled soil, but not through a carrot standing in it', () => {
    const w = atField(48, 17, 'left') // 47,17 has a carrot growing on it
    apply(w, { type: 'move', dir: 'left' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y, w.player.step]).toEqual([48, 17, null])

    apply(w, { type: 'interact' }, content) // pull it up and the bare soil is walkable
    apply(w, { type: 'interact' }, content) // dismiss the got box
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y]).toEqual([47, 17])
  })

  it('hands over a carrot per interact, with the got box the first time only', () => {
    const w = atField(48, 17, 'left')
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.carrot).toBe(1)
    expect(objectAt(w, 47, 17)).toBeUndefined()
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'carrot' })

    apply(w, { type: 'interact' }, content) // dismiss it
    w.player.facing = 'right' // 49,17, the next one along the row
    apply(w, { type: 'interact' }, content)
    expect([w.inventory.carrot, w.dialogue]).toEqual([2, null])
  })

  it('takes all twelve across his gate, asking for a chair before any award', () => {
    const w = atField(48, 17, 'left')
    // every carrot but this one already picked, so this interact empties the field
    w.objects = w.objects.filter((o) => o.kind !== 'carrot' || (o.x === 47 && o.y === 17))
    w.flags['had:carrot'] = true // the got box for a carrot is long since seen
    w.inventory.carrot = 11
    apply(w, { type: 'interact' }, content)
    expect([w.inventory.carrot, w.dialogue]).toEqual([12, null]) // the last one up is just a carrot

    w.player = { ...w.player, x: 49, y: 14, facing: 'up' } // at his gate with the lot
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('carrots')
    expect(w.inventory.carrot).toBeUndefined()

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('askchair')
    expect(w.flags['shrimp:chair']).toBe(true)
    expect([w.inventory.certificate, w.flags['shrimp:thanked']]).toEqual([undefined, undefined])
  })

  it('hands over the award for a deck chair, and not before', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 49, y: 14, facing: 'up' }
    w.flags['shrimp:chair'] = true
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('nochair')
    apply(w, { type: 'interact' }, content)

    w.inventory.chair = 1
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('chair')
    expect([w.inventory.chair, w.inventory.certificate]).toEqual([undefined, 1])
    expect(w.flags['shrimp:thanked']).toBe(true)
    expect(w.queue).toEqual([{ key: 'got', item: 'certificate' }]) // the award's box waits its turn

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'certificate' })
  })

  it('talks to the farmer from the grass below his stool', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 49, y: 14, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('shrimp')
    const him = w.objects.find((o) => o.id === 'shrimp')
    expect(him?.kind === 'npc' && him.facing).toBe('down') // he turns back to the player
  })
})
