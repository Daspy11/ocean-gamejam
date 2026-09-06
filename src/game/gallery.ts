import { npc } from './world'
import type { Obj } from './world'

// The artist's proof sheet: one of every object on the pad of ?map=gallery, x 2..10, y 17..21. A
// function rather than a list, since world.ts imports this while npc() is not there yet.
export const gallery = (): Obj[] => [
  { id: 'g-tree', kind: 'tree', x: 2, y: 18 },
  { id: 'g-boat', kind: 'boat', x: 7, y: 18 },
  { id: 'g-crate', kind: 'crate', x: 2, y: 20, open: false, item: 'orb' },
  { id: 'g-crate-open', kind: 'crate', x: 4, y: 20, open: true, item: 'orb' },
  npc('g-mich', 'mich', 6, 20, 'down', 'mich'),
  // a day of sim time away, so this one keeps smoking however long the gallery is left open
  { id: 'g-orb', kind: 'orb', x: 12, y: 18, doneAt: 86400000 },
  { id: 'g-orb-salt', kind: 'orb', x: 12, y: 20, doneAt: 0 }, // already sat on its finished salt
  // 8,18 is under g-boat's 2x1 footprint, so Walter stands in the next free slot along
  npc('g-walter', 'walter', 9, 18, 'down', 'walter'),
  { id: 'g-flower', kind: 'flower', x: 9, y: 20, white: false },
  { id: 'g-flower-white', kind: 'flower', x: 10, y: 20, white: true },
  { id: 'g-sign', kind: 'sign', x: 3, y: 20, dialogue: 'sign' },
  { id: 'g-fence', kind: 'fence', x: 2, y: 19 }, // two in a row, so the rail line reads
  { id: 'g-fence2', kind: 'fence', x: 3, y: 19 },
  // a day of sim time away, so the prototype keeps smoking rather than blowing up in here
  { id: 'g-machine', kind: 'machine', x: 5, y: 19, nextAt: 86400000 },
  npc('g-seahorse', 'seahorse', 7, 19, 'down', 'seahorse'),
  { id: 'g-wreck', kind: 'boat', x: 5, y: 17, wrecked: true }, // the smashed hull frame
  // the farmer on his stool and on the deck chair he gets for the certificate, and the
  // two prizes that stand on the ground out of the bag
  npc('g-shrimp', 'shrimp', 8, 17, 'down', 'shrimp'),
  npc('g-shrimpchair', 'shrimpchair', 9, 17, 'down', 'shrimp'),
  { id: 'g-egg', kind: 'egg', x: 10, y: 17 },
  { id: 'g-certificate', kind: 'certificate', x: 10, y: 19 },
  // the pirate faces the way he is not looking, so this row draws his back
  npc('g-etarp', 'etarp', 4, 18, 'down', 'etarp'),
  npc('g-harry', 'harry', 8, 19, 'down', 'harry'),
  // the bottom row: the bar bare and with a drink on it, the gate, a deck chair, the rum
  { id: 'g-bar', kind: 'bar', x: 2, y: 21 },
  { id: 'g-bar-drink', kind: 'bar', x: 3, y: 21, drink: true },
  { id: 'g-gate', kind: 'gate', x: 5, y: 21 },
  { id: 'g-chair', kind: 'chair', x: 7, y: 21 },
  { id: 'g-rum', kind: 'rum', x: 9, y: 21 },
  { id: 'g-cannon', kind: 'cannon', x: 4, y: 21 },
  // fired a day of sim time from now, so this one hangs at the muzzle until then
  { id: 'g-ball', kind: 'ball', x: 6, y: 21, at: 86400000, dir: 0 },
  { id: 'g-cinder', kind: 'cinder', x: 8, y: 21 },
  // the lord and the carpet he flies in on
  npc('g-tarq', 'tarq', 4, 19, 'down', 'tarq'),
  { id: 'g-flyingcarpet', kind: 'flyingcarpet', x: 6, y: 19 },
]
