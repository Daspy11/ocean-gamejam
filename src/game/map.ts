import { gallery } from './gallery'
import { npc, type Dir, type Obj, type Tile, type World } from './world'

// Rows of equal length; createWorld() takes the size from them. `~` water · `s` salt · `.` sand ·
// `#` grass · `^` rock (solid) · `T` grass with a tree on it (a big-island tree, talked to rather
// than shaken) · `F` farmland with a carrot on it · `=` grass with a fence post on it.
// Hand-edit freely.
// island: 80x44, x=-16..63. The western extension keeps existing story coordinates intact. The wreck sits at 12..13,16 (half in the water). The small east
// island is exactly two water tiles away at rows 15..17. An empty island sits far north at rows 1..5,
// x 19..25 — above everything the camera can reach from either island, so you only find it by building.
// The big island fills x 32..60, y 10..27, four water tiles east of the small one. A forest covers its
// middle, and the cave mouth at 42,17 sits at the top of a one-tile corridor down through it,
// 42,18..21, with the locked gate (gate1 in world.ts) on its south end at 42,21. The east side bulges out to make room for the shrimp's carrot field: twelve
// carrots in four rows a tile apart, with a clear tile inside the fence ring at 45..55,15..21 all the
// way round them; the ring's one gate is at 49,15, with his stool
// right above it at 49,13. The cave interior is a separate map; its exit returns to 42,18.
// The note chest at 48,22 sits between the fence and an L of trees; salt around the shore reaches it.
// gallery: `?map=gallery`, the artist's proof sheet. Top, left to right in salt, sand, grass and
// rock: a 2x2 block (the sheet's 3x3 island), a 3x3 ring (its 2x2 hole) and a checkerboard (the
// diagonals), so a correct sheet redraws every frame of the 5x3 layout in game. Below it
// salt/sand/grass nested, to show the layering. Below that the 9x5 pad every object stands on,
// with two orbs beside it: one still boiling the water it sits in, one on the salt tile it finished.
export const MAPS = {
  island: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.####.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.#####.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.####.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.....~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..#####..~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...~~~~~~~~~~~~~~~~~~..T#####T####..~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.###..~~~~~~~~~~~~~~..################..~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.#####.~~~~..~~~~~~~.#######TTT###########.~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.######.~~.##.~~~~~.##T###TTTTTT====#======#.~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.######.~~.###.~~~~.######TTTTTT=#########=##.~~~~~',
    '~~~~~~~~~~~~~..~~~~~~~~~~~~~~.######.~~.###.~~~~.#####TTTT#TT=#F#F#F#F#=##.~~~~~',
    '~~~~~~~~~~~~~..~~~~~~~~~~~~~~~.####.~~~~...~~~~~.#####TTTT#TT=#F#F#F#F#=##.~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.###.~~~~~~~~~~~~~~.####TTTT#TT=#F#F#F#F#=##.~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.#.~~~~~~~~~~~~~~~.######TT#TT=#########=#.~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.~~~~~~~~~~~~~~~~~.######T#T#===========#.~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.############T######..~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.T##########T##TTT~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.###########TT~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..######..~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..###.~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  cave: [
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^......^^^^^^^^',
    '^^^^^^^^......^^^^^^^^',
    '^^^^^^^^......^^^^^^^^',
    '^^^^^^^^......^^^^^^^^',
    '^^^^^^^^^^.^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^^^',
  ],
  gallery: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~ss~sss~..~...~##~###~^^~^^^~~~~',
    '~ss~s~s~..~.~.~##~#~#~^^~^~^~~~~',
    '~~~~sss~~~~...~~~~###~~~~^^^~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~s~~~~~~.~~~~~~#~~~~~~^~~~~~~~~',
    '~s~s~~~~.~.~~~~#~#~~~~^~^~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~sssssss~~~~~~~~~~~~~~~~~~~~~~~~',
    '~s.....s~~~~~~~~~~~~~~~~~~~~~~~~',
    '~s.###.s~~~~~~~~~~~~~~~~~~~~~~~~',
    '~s.###.s~~~~~~~~~~~~~~~~~~~~~~~~',
    '~s.###.s~~~~~~~~~~~~~~~~~~~~~~~~',
    '~s.....s~~~~~~~~~~~~~~~~~~~~~~~~',
    '~sssssss~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~.........~~~~~~~~~~~~~~~~~~~~~',
    '~~.........~~~~~~~~~~~~~~~~~~~~~',
    '~~.........~~~~~~~~~~~~~~~~~~~~~',
    '~~.........~s~~~~~~~~~~~~~~~~~~~',
    '~~.........~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
}

export function createWorld(map: keyof typeof MAPS = 'island'): World {
  const rows = MAPS[map]
  const [width, height] = [rows[0].length, rows.length]
  const left = map === 'island' ? -16 : 0
  if (rows.some((row) => row.length !== width))
    throw new Error(`map.ts ${map} must be rows of ${width} characters`)
  const glyph: Record<string, Tile> = {
    '~': 'water',
    s: 'salt',
    '.': 'sand',
    '#': 'grass',
    '^': 'rock',
    T: 'grass', // a tree stands on it: the tile itself is ordinary grass
    F: 'farm', // tilled soil with a carrot growing on it
    '=': 'grass', // grass with a fence post standing on it
  }
  const tiles = rows.flatMap((row) => [...row].map((ch) => glyph[ch]))
  // island: the intro ends with the boat crashing into the west shore, so that is where everyone
  // starts. gallery: the middle of the object pad, facing the camera.
  const spawn: { x: number; y: number; facing: Dir } =
    map === 'cave'
      ? { x: 10, y: 8, facing: 'up' }
      : map === 'gallery'
        ? { x: 8, y: 20, facing: 'down' }
        : { x: 14, y: 16, facing: 'right' }
  // the main island is whatever land you can walk to from the spawn: every other island is out at
  // sea as far as beauty is concerned
  const main = tiles.map(() => false)
  const edge = map === 'cave' ? [] : [spawn.y * width + spawn.x - left]
  while (edge.length) {
    const at = edge.pop()!
    if (main[at] || tiles[at] === 'water') continue
    main[at] = true
    // the four neighbours, minus any that fell off an end of the map or wrapped onto another row
    for (const to of [at - 1, at + 1, at - width, at + width])
      if (to >= 0 && to < tiles.length && Math.abs((to % width) - (at % width)) <= 1) edge.push(to)
  }
  const objects: Obj[] =
    map === 'gallery'
      ? gallery()
      : map === 'cave'
        ? [
            {
              id: 'caveout',
              kind: 'cave',
              x: 10,
              y: 9,
              to: { x: 42, y: 18, area: 'island' },
              inside: true,
            },
            { id: 'rum1', kind: 'rum', x: 10, y: 5 },
          ]
        : [
            { id: 'boat1', kind: 'boat', x: 12, y: 16 },
            // thrown clear of the boat in the crash and left lying in the sand: picked up, not opened
            { id: 'orb1', kind: 'orb', x: 13, y: 15, doneAt: 0 },
            // the second crate, over on the far island: the reason to bridge the gap
            { id: 'crate2', kind: 'crate', x: 24, y: 17, open: false, item: 'electrolytes' },
            npc('mich', 'mich', 13, 17, 'right', 'mich'),
            { id: 'tree1', kind: 'tree', x: 16, y: 16 },
            { id: 'sign1', kind: 'sign', x: 25, y: 16, dialogue: 'sign' },
            // out on the big island, on the grass the forest leaves clear
            {
              id: 'crate3',
              kind: 'crate',
              x: 48,
              y: 22,
              open: false,
              item: 'note',
              dialogue: 'note',
            },
            Object.assign(npc('albatross', 'albatross', 36, 20, 'down', 'albatross'), {
              wander: { x: 34, y: 19 },
            }),
            // the mouth walled in by the forest, and the sand tile at the far end of the room
            { id: 'cave1', kind: 'cave', x: 42, y: 17, to: { x: 10, y: 8, area: 'cave' } },
            // the locked gate at the south end of the corridor through the forest to the mouth
            { id: 'gate1', kind: 'gate', x: 42, y: 21 },
            { id: 'rum-sign', kind: 'sign', x: 43, y: 22, dialogue: 'rum-sign' },
            // the farmer, sat on his stool right above the gate in his fence
            npc('shrimp', 'shrimp', 49, 13, 'down', 'shrimp'),
            // the chest on the north island's west tip, with the key to the gate in it
            { id: 'crate4', kind: 'crate', x: 19, y: 3, open: false, item: 'key' },
            { id: 'crate5', kind: 'crate', x: -3, y: 17, open: false, item: 'glassi' },
            // suspicious harry, reclining over his three chairs on the big island's south shore:
            // one picture of the whole scene, on a 4x1 footprint over the same row as the chairs. They
            // sit on 40, across 41..42 (one chair painted over two tiles) and 43, and stay their own
            // objects for the pick-up-a-chair mechanic, but draw nothing themselves while his sheet
            // still shows them. Listed in the order his sheet lets go of them: west, east, then the
            // one under him
            { id: 'chair1', kind: 'chair', x: 40, y: 26, hidden: true },
            { id: 'chair3', kind: 'chair', x: 43, y: 26, hidden: true },
            { id: 'chair2', kind: 'splitchair', x: 41, y: 26, hidden: true },
            { id: 'harry', kind: 'harry', x: 40, y: 26, dialogue: 'harry' },
          ]
  // the forest and the carrot field are drawn in the map rather than listed: one object per glyph
  rows.forEach((row, y) =>
    [...row].forEach((ch, column) => {
      const x = column + left
      if (ch === 'T') objects.push({ id: `tree${x}-${y}`, kind: 'tree', x, y, dialogue: 'bigtree' })
      if (ch === 'F') objects.push({ id: `carrot${x}-${y}`, kind: 'carrot', x, y })
      // a run with fence on neither side but one above or below is climbing north-south
      if (ch === '=') {
        const vertical =
          (rows[y - 1]?.[column] === '=' || rows[y + 1]?.[column] === '=') &&
          row[column - 1] !== '=' &&
          row[column + 1] !== '='
        objects.push({ id: `fence${x}-${y}`, kind: vertical ? 'fencev' : 'fence', x, y })
      }
    }),
  )
  return {
    area: map === 'cave' ? 'cave' : 'island',
    rev: 0,
    time: 0,
    rumble: 0,
    seed: 1,
    width,
    left,
    height,
    tiles,
    main,
    player: { ...spawn, step: null, held: null, run: false, turnedAt: 0, parity: false },
    inventory: {},
    score: 0,
    pops: [],
    objects,
    flags: {},
    dialogue: null,
    queue: [],
    menu: null,
    throwing: null,
    closeup: null,
  }
}

// Swap only the area's terrain and objects: inventory, story flags and score travel with the player.
export function enterCave(w: World, mouth: Obj & { kind: 'cave' }): void {
  const to = mouth.to
  if (to.area && to.area !== w.area) {
    const { width, height, left, tiles, main, objects, pops } = w
    const next = w.away ?? createWorld(to.area)
    Object.assign(w, {
      area: to.area,
      width: next.width,
      height: next.height,
      left: next.left,
      tiles: next.tiles,
      main: next.main,
      objects: next.objects,
      pops: next.pops,
      away: { width, height, left, tiles, main, objects, pops },
    })
    Object.assign(w.player, { step: null, held: null, path: undefined, face: undefined })
  }
  w.player.x = to.x
  w.player.y = to.y
  w.rev++
}
