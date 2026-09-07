import { describe, expect, it } from 'vitest'
import { MAPS } from './map'
import { KINDS, createWorld, objectAt, tileAt } from './world'

describe('createWorld', () => {
  it('takes the grid size from the rows of the map it is given', () => {
    const w = createWorld()
    expect([w.width, w.height, w.tiles.length]).toEqual([64, 44, 64 * 44])
    expect(tileAt(w, 16, 16)).toBe('grass') // the middle of the main island
    expect(tileAt(w, 7, 38)).toBe('rock') // the wall of the room the cave leads to
    expect(tileAt(w, 42, 17)).toBe('grass') // the tile the cave mouth stands on
    const g = createWorld('gallery')
    expect([g.width, g.height, g.tiles.length]).toEqual([32, 32, 32 * 32])
  })

  it('plants a tree of its own on every T, and leaves the tile under it grass', () => {
    const w = createWorld()
    expect(tileAt(w, 41, 17)).toBe('grass') // a forest tile is ordinary grass...
    const tree = objectAt(w, 41, 17)
    expect(tree?.id).toBe('tree41-17') // ...with a tree standing on it, talked to like tree2
    expect(tree?.kind === 'tree' && tree.dialogue).toBe('bigtree')
    const planted = MAPS.island.reduce((n, row) => n + [...row].filter((c) => c === 'T').length, 0)
    expect(w.objects.filter((o) => o.id.startsWith('tree') && o.id !== 'tree1').length).toBe(
      planted,
    )
    // the forest walls the mouth in on three sides; the fourth is the corridor down to the gate
    for (const [x, y] of [
      [41, 17],
      [43, 17],
      [42, 16],
    ])
      expect(objectAt(w, x, y)?.kind).toBe('tree')
    for (let y = 18; y <= 20; y++) expect(objectAt(w, 42, y)).toBeUndefined()
    expect(objectAt(w, 42, 21)?.kind).toBe('gate')
  })

  it('lays out the wreck shore, the southern spit, and the gap to the second island', () => {
    const w = createWorld()
    expect(tileAt(w, 12, 16)).toBe('water') // the wreck's outer half is still in the sea
    expect(tileAt(w, 13, 16)).toBe('sand')
    expect(tileAt(w, 16, 21)).toBe('sand') // the tip of the southern spit
    expect(tileAt(w, 20, 16)).toBe('sand') // the east beach the bridge starts from
    expect(tileAt(w, 21, 16)).toBe('water') // exactly two tiles of open water
    expect(tileAt(w, 22, 16)).toBe('water')
    expect(tileAt(w, 23, 16)).toBe('sand') // the second island
  })

  it('hides a third, empty island far north of anything the camera reaches', () => {
    const w = createWorld()
    expect(tileAt(w, 22, 3)).toBe('grass') // its core
    expect(tileAt(w, 22, 1)).toBe('sand') // its north rim
    expect(tileAt(w, 22, 6)).toBe('water') // open sea between it and the main island
    expect(tileAt(w, 22, 0)).toBe('water') // a clear margin at the map edge
  })

  it('stands every object on land, bar the half of the boat left in the water', () => {
    const w = createWorld()
    const wet = w.objects
      .flatMap((o) => {
        const k = KINDS[o.kind]
        return Array.from({ length: k.w * k.h }, (_, i) => [
          o.x + (i % k.w),
          o.y + Math.floor(i / k.w),
        ])
      })
      .filter(([x, y]) => tileAt(w, x, y) === 'water')
    expect(wet).toEqual([[12, 16]])
  })
})

describe('objectAt', () => {
  it('finds each object on its tile, and nothing on the free ones', () => {
    const w = createWorld()
    expect(objectAt(w, 16, 16)?.id).toBe('tree1') // the middle of the island
    expect(objectAt(w, 13, 15)?.id).toBe('mich')
    expect(objectAt(w, 13, 17)?.id).toBe('crate1')
    expect(objectAt(w, 24, 17)?.id).toBe('crate2') // the far island, past the sign
    expect(objectAt(w, 25, 16)?.id).toBe('sign1') // on the second island's grass
    expect(objectAt(w, 14, 16)).toBeUndefined() // the player's tile
    expect(objectAt(w, 16, 15)).toBeUndefined() // the tile the tree's canopy hangs over
    expect(objectAt(w, 36, 20)?.id).toBe('albatross') // out on the big island
    expect(objectAt(w, 48, 22)?.id).toBe('crate3') // and the crate on the grass east of the forest
    expect(objectAt(w, 42, 17)?.id).toBe('cave1') // the mouth, walled in by the forest
    expect(objectAt(w, 10, 37)?.id).toBe('rum1') // and the rum in the room it leads to
    expect(objectAt(w, 42, 21)?.id).toBe('gate1') // the gate at the foot of the corridor to it
    expect(objectAt(w, 19, 3)?.id).toBe('crate4') // the chest with the key, on the north island
    expect(objectAt(w, 42, 25)?.id).toBe('harry') // over his chairs on the south shore
    expect(objectAt(w, 43, 26)?.id).toBe('chair3')
  })

  it('finds the wrecked boat on both of its tiles', () => {
    const w = createWorld()
    expect(objectAt(w, 12, 16)?.id).toBe('boat1') // the half still in the water
    expect(objectAt(w, 13, 16)?.id).toBe('boat1') // the half up on the sand
    expect(objectAt(w, 14, 16)).toBeUndefined() // the player, one tile inland
  })
})

describe('the intro landing', () => {
  it('leaves the player on the west shore facing the island', () => {
    const w = createWorld()
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([14, 16, 'right'])
    const mich = w.objects.find((o) => o.id === 'mich')
    expect(mich?.kind === 'npc' && mich.sprite).toBe('mich')
    expect(mich?.kind === 'npc' && mich.dialogue).toBe('mich')
  })

  it('washes the crate ashore beside the wreck, still shut, with nothing carried', () => {
    const w = createWorld()
    const crate = w.objects.find((o) => o.id === 'crate1')
    expect(crate?.kind === 'crate' && crate.open).toBe(false)
    expect([crate?.x, crate?.y]).toEqual([13, 17])
    expect(crate?.kind === 'crate' && crate.item).toBe('orb')
    // and the second one, shut too, over on the far island
    const other = w.objects.find((o) => o.id === 'crate2')
    expect(other?.kind === 'crate' && [other.x, other.y, other.open, other.item]).toEqual([
      24,
      17,
      false,
      'electrolytes',
    ])
    expect(w.inventory).toEqual({})
    expect(w.objects.some((o) => o.kind === 'orb')).toBe(false) // the orb is still in the crate
    expect([w.dialogue, w.queue, w.flags]).toEqual([null, [], {}])
  })
})

describe('tileAt', () => {
  it('is undefined outside the map', () => {
    const w = createWorld()
    expect(tileAt(w, -1, 16)).toBeUndefined()
    expect(tileAt(w, 16, -1)).toBeUndefined()
    expect(tileAt(w, w.width, 16)).toBeUndefined()
    expect(tileAt(w, 16, w.height)).toBeUndefined()
  })
})

describe('the gallery map', () => {
  it('lays an island, a ring and a checkerboard out in every terrain, a water column apart', () => {
    const w = createWorld('gallery')
    // a 2x2 block, a 3x3 ring with a hole and a checkerboard: together they draw every frame of the
    // 5x3 terrain sheet (see DUAL_FRAME in src/assets) exactly once
    const rows = ['ss~sss', 'ss~s~s', '~~~sss', '~~~~~~', '~s~~~~', 's~s~~~']
    for (const [x, terrain] of [
      [1, 'salt'],
      [8, 'sand'],
      [15, 'grass'],
      [22, 'rock'],
    ] as const)
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++)
          expect(tileAt(w, x + c, 1 + r)).toBe(rows[r][c] === 's' ? terrain : 'water')
    expect([tileAt(w, 7, 1), tileAt(w, 14, 1)]).toEqual(['water', 'water']) // the gaps between blocks
  })

  it('nests grass in sand in salt for the layering sampler', () => {
    const w = createWorld('gallery')
    expect([tileAt(w, 1, 11), tileAt(w, 2, 11), tileAt(w, 4, 11)]).toEqual([
      'salt',
      'sand',
      'grass',
    ])
  })

  it('stands one of every object on the pad, with the orbs out beside it', () => {
    const w = createWorld('gallery')
    expect(w.objects.map((o) => o.id)).toEqual([
      'g-tree',
      'g-boat',
      'g-crate',
      'g-crate-open',
      'g-mich',
      'g-orb',
      'g-orb-salt',
      'g-walter',
      'g-flower',
      'g-flower-white',
      'g-sign',
      'g-fence',
      'g-fence2',
      'g-fencev',
      'g-fencev2',
      'g-machine',
      'g-seahorse',
      'g-wreck',
      'g-shrimp',
      'g-shrimpchair',
      'g-egg',
      'g-certificate',
      'g-etarp',
      'g-harry',
      'g-bar',
      'g-bar-drink',
      'g-gate',
      'g-chair',
      'g-rum',
      'g-cannon',
      'g-ball',
      'g-cinder',
      'g-tarq',
      'g-flyingcarpet',
    ])
    // one orb still boiling its water tile, one already sat on the salt it made
    const wet = w.objects.filter((o) => tileAt(w, o.x, o.y) === 'water').map((o) => o.id)
    expect(wet).toEqual(['g-orb'])
    expect(tileAt(w, 12, 20)).toBe('salt')
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([8, 20, 'down'])
    expect(objectAt(w, 8, 20)).toBeUndefined() // nothing standing where the player spawns
  })
})
