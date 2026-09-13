import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content } from './world'

const content: Content = {
  items: {},
  dialogues: {
    bigtree: {
      name: '',
      start: [{ node: '1' }],
      nodes: Object.fromEntries(
        ['1', '5', '10', '15', '20'].map((n) => [
          n,
          { text: `[PLACEHOLDER tree inspection ${n}]`, next: null },
        ]),
      ),
    },
    tree2: {
      name: '',
      start: [{ node: '1' }],
      nodes: { '1': { text: '[PLACEHOLDER tree 2]', next: null } },
    },
  },
}

describe('inspecting the big island trees', () => {
  it('counts distinct trees, remembers them after loading, and plays each milestone once', () => {
    let w = createWorld()
    const trees = w.objects.filter((o) => o.kind === 'tree' && o.dialogue === 'bigtree')
    expect(trees.length).toBeGreaterThan(20)
    for (const [i, tree] of trees.slice(0, 21).entries()) {
      w.player = { ...w.player, x: tree.x, y: tree.y + 1, facing: 'up' }
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue?.node).toBe([5, 10, 15, 20].includes(i + 1) ? `${i + 1}` : '1')
      expect(w.flags['bigtree:count']).toBe(i + 1)
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue).toBeNull()
      w = JSON.parse(JSON.stringify(w))
      apply(w, { type: 'interact' }, content)
      expect(w.dialogue?.node).toBe('1')
      expect(w.flags['bigtree:count']).toBe(i + 1)
      apply(w, { type: 'interact' }, content)
    }
    expect(w.inventory.twig).toBeUndefined()
  })

  it('does not count the talking trees', () => {
    const w = createWorld()
    w.objects = [{ id: 'tree2', kind: 'tree', x: 16, y: 16, dialogue: 'tree2' }]
    w.player = { ...w.player, x: 16, y: 17, facing: 'up' }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('tree2')
    expect(w.flags['bigtree:count']).toBeUndefined()
  })
})
