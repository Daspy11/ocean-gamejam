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
    shrimp: {
      name: '[PLACEHOLDER NPC NAME]',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER the farmer asks]', next: null } },
    },
    // the shape of assets/dialogue/carrots.json: his thanks, and the award that comes with them
    carrots: {
      name: '[PLACEHOLDER NPC NAME]',
      trigger: { event: 'carrots:done' },
      start: [{ node: '1' }],
      nodes: {
        '1': {
          text: '[PLACEHOLDER the farmer is grateful]',
          give: 'certificate',
          set: { 'shrimp:thanked': true },
          next: null,
        },
      },
    },
  },
  items: { carrot: { name: '[PLACEHOLDER carrot]' } },
}

// on the grass gap at 48,y between the first two strips, facing whichever one the test wants
function atField(y: number, facing: 'left' | 'right'): World {
  const w = createWorld()
  w.player = { ...w.player, x: 48, y, facing }
  return w
}

describe('the carrot field', () => {
  it('plants one carrot per F and sits the farmer on his stool', () => {
    const w = createWorld()
    const sown = MAPS.island.reduce((n, row) => n + [...row].filter((c) => c === 'F').length, 0)
    expect(w.objects.filter((o) => o.kind === 'carrot').length).toBe(sown)
    expect(objectAt(w, 47, 16)?.id).toBe('carrot47-16')
    expect(tileAt(w, 47, 16)).toBe('farm')
    expect(objectAt(w, 49, 14)?.id).toBe('shrimp')
  })

  it('walks the tilled soil, but not through a carrot standing in it', () => {
    const w = atField(16, 'left') // 47,16 has a carrot growing on it
    apply(w, { type: 'move', dir: 'left' }, content)
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y, w.player.step]).toEqual([48, 16, null])

    apply(w, { type: 'interact' }, content) // pull it up and the bare soil is walkable
    apply(w, { type: 'interact' }, content) // dismiss the got box
    apply(w, { type: 'tick', dt: 300 }, content)
    expect([w.player.x, w.player.y]).toEqual([47, 16])
  })

  it('hands over a carrot per interact, with the got box the first time only', () => {
    const w = atField(16, 'left')
    apply(w, { type: 'interact' }, content)
    expect(w.inventory.carrot).toBe(1)
    expect(objectAt(w, 47, 16)).toBeUndefined()
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'carrot' })

    apply(w, { type: 'interact' }, content) // dismiss it
    w.player.facing = 'right' // 49,16, the next strip along
    apply(w, { type: 'interact' }, content)
    expect([w.inventory.carrot, w.dialogue]).toEqual([2, null])
  })

  it('brings the farmer over with an award once the last one is up', () => {
    const w = atField(16, 'left')
    // every carrot but this one already picked, so this interact empties the field
    w.objects = w.objects.filter((o) => o.kind !== 'carrot' || (o.x === 47 && o.y === 16))
    w.flags['had:carrot'] = true // the got box for a carrot is long since seen

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('carrots')
    expect(w.flags['fired:carrots']).toBe(true)
    expect(w.inventory.certificate).toBe(1)
    expect(w.flags['had:certificate']).toBe(true)
    expect(w.flags['shrimp:thanked']).toBe(true)
    expect(w.queue).toEqual([{ key: 'got', item: 'certificate' }]) // the award's box waits its turn

    apply(w, { type: 'interact' }, content)
    expect(w.dialogue).toEqual({ key: 'got', node: '1', choice: 0, item: 'certificate' })
  })

  it('talks to the farmer from the grass below his stool', () => {
    const w = createWorld()
    w.player = { ...w.player, x: 49, y: 15, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('shrimp')
    const him = w.objects.find((o) => o.id === 'shrimp')
    expect(him?.kind === 'npc' && him.facing).toBe('down') // he turns back to the player
  })
})
