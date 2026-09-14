import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAPS } from './map'
import { apply } from './actions'
import { findPath } from './path'
import { walkPlayer } from './boat'
import { DIRS, KINDS, createWorld, npc, objectAt, tileAt, type Content } from './world'

describe('createWorld', () => {
  it('requires a salt route around the trees to reach the note chest', () => {
    const w = createWorld()
    const c: Content = {
      dialogues: {
        note: JSON.parse(
          readFileSync(new URL('../../assets/dialogue/note.json', import.meta.url), 'utf8'),
        ),
      },
      items: {},
    }
    Object.assign(w.player, { x: 46, y: 22 })
    const walker = npc('player', 'player', 46, 22, 'right', '')
    const chest = w.objects.find((o) => o.id === 'crate3')!
    for (const [dx, dy] of Object.values(DIRS))
      expect(findPath(w, walker, { x: chest.x + dx, y: chest.y + dy })).toBeNull()
    expect(findPath(w, walker, { x: 49, y: 24 })).not.toBeNull()
    Object.assign(w.player, { x: 49, y: 24 })
    w.inventory.orb = 1
    for (const dir of ['right', 'right', 'right', 'right', 'up'] as const) {
      w.player.facing = dir
      const x = w.player.x + DIRS[dir][0]
      const y = w.player.y + DIRS[dir][1]
      expect(tileAt(w, x, y)).toBe('water')
      apply(w, { type: 'interact' }, c)
      apply(w, { type: 'tick', dt: 2000 }, c)
      expect(tileAt(w, x, y)).toBe('salt')
      apply(w, { type: 'interact' }, c)
      expect(w.inventory.orb).toBe(1)
      walkPlayer(w, { id: 'player', to: { x, y } })
      for (let i = 0; i < 5 && (w.player.step || w.player.path?.length); i++)
        apply(w, { type: 'tick', dt: 100 }, c)
      expect(w.player).toMatchObject({ x, y })
    }
    walkPlayer(w, { id: 'player', to: { x: chest.x + 1, y: chest.y }, facing: 'left' })
    for (let i = 0; i < 100 && (w.player.step || w.player.path?.length); i++)
      apply(w, { type: 'tick', dt: 100 }, c)
    expect(w.player).toMatchObject({ x: chest.x + 1, y: chest.y, facing: 'left' })
    apply(w, { type: 'interact' }, c)
    expect(chest).toMatchObject({ open: true })
    for (const text of [
      'you found a note',
      'the note reads:',
      "DR. SCEANTIST'S EXPERIMENT NOTES (PLS DONT STEAL)",
      'i regret working on this whole name augmentation thing',
      'i paid some guy $20 to test out my letter removal potion but it accidentally reversed his name too',
      "and then he ran off backwards and i couldn't find him to give him his letter back",
      'anyway, i have stowed it on a little island to the west for safekeeping so i can give it back to him later',
    ]) {
      expect(w.typing?.text).toBe(text)
      apply(w, { type: 'interact' }, c)
    }
    expect(w.dialogue).toBeNull()
    expect(w.inventory).toEqual({ orb: 1, note: 1 })
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue).toBeNull()
    expect(w.inventory).toEqual({ orb: 1, note: 1 })
  })

  it('takes the grid size from the rows of the map it is given', () => {
    const w = createWorld()
    expect([w.width, w.height, w.tiles.length]).toEqual([80, 44, 80 * 44])
    expect(tileAt(w, 16, 16)).toBe('grass') // the middle of the main island
    expect(tileAt(w, 7, 38)).toBe('water') // the cave no longer occupies the ocean
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
    expect(objectAt(w, 13, 15)?.id).toBe('orb1')
    expect(objectAt(w, 13, 17)?.id).toBe('mich')
    expect(objectAt(w, 24, 17)?.id).toBe('crate2') // the far island, past the sign
    expect(objectAt(w, 25, 16)?.id).toBe('sign1') // on the second island's grass
    expect(objectAt(w, 14, 16)).toBeUndefined() // the player's tile
    expect(objectAt(w, 16, 15)).toBeUndefined() // the tile the tree's canopy hangs over
    expect(objectAt(w, 36, 20)?.id).toBe('albatross') // out on the big island
    expect(objectAt(w, 48, 22)?.id).toBe('crate3') // and the crate on the grass east of the forest
    expect(objectAt(w, 42, 17)?.id).toBe('cave1') // the mouth, walled in by the forest
    expect(objectAt(createWorld('cave'), 10, 5)?.id).toBe('rum1')
    expect(objectAt(w, 42, 21)?.id).toBe('gate1') // the gate at the foot of the corridor to it
    expect(objectAt(w, 19, 3)?.id).toBe('crate4') // the chest with the key, on the north island
    expect(objectAt(w, 40, 25)?.id).toBe('harry') // his picture, 4x2, lying over the chairs
    expect(objectAt(w, 43, 25)?.id).toBe('harry')
    expect(objectAt(w, 40, 26)?.id).toBe('chair1') // the chairs come first, so they win their tiles
    expect(objectAt(w, 41, 26)?.id).toBe('chair2') // both halves of the one painted across 41..42
    expect(objectAt(w, 42, 26)?.id).toBe('chair2')
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

  it('throws the orb ashore beside the wreck, with nothing carried', () => {
    const w = createWorld()
    const orb = w.objects.find((o) => o.id === 'orb1')
    expect(orb?.kind).toBe('orb')
    expect([orb?.x, orb?.y]).toEqual([13, 15])
    // and the second one, shut too, over on the far island
    const other = w.objects.find((o) => o.id === 'crate2')
    expect(other?.kind === 'crate' && [other.x, other.y, other.open, other.item]).toEqual([
      24,
      17,
      false,
      'electrolytes',
    ])
    expect(w.inventory).toEqual({}) // it is on the sand, not in the bag
    expect([w.dialogue, w.queue, w.flags]).toEqual([null, [], {}])
  })
})

describe('tileAt', () => {
  it('is undefined outside the map', () => {
    const w = createWorld()
    expect(tileAt(w, (w.left ?? 0) - 1, 16)).toBeUndefined()
    expect(tileAt(w, 16, -1)).toBeUndefined()
    expect(tileAt(w, (w.left ?? 0) + w.width, 16)).toBeUndefined()
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
      'g-bar',
      'g-bar-drink',
      'g-gate',
      'g-chair',
      'g-rum',
      'g-cannon',
      'g-ball',
      'g-cinder',
      'g-embedded',
      'g-cave',
      'g-cave-inside',
      'g-tarq',
      'g-flyingcarpet',
      'g-flyingcarpet-flying',
      'g-harry',
      'g-splitchair',
    ])
    // one orb still boiling its water tile, one already sat on the salt it made; harry sits out on
    // the water too, just because the pad has no room left for his 4x2 picture, and his split
    // chair stands out there beside him
    const wet = w.objects.filter((o) => tileAt(w, o.x, o.y) === 'water').map((o) => o.id)
    expect(wet).toEqual(['g-orb', 'g-harry', 'g-splitchair'])
    expect(tileAt(w, 12, 20)).toBe('salt')
    expect([w.player.x, w.player.y, w.player.facing]).toEqual([8, 20, 'down'])
    expect(objectAt(w, 8, 20)).toBeUndefined() // nothing standing where the player spawns
  })
})
