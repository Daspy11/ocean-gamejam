import { objectAt, tileAt } from './world'
import type { Item, World } from './world'

// what stands on the ground out of the bag, and the kind of object it stands there as
const STANDS: Partial<Record<Item, 'floor' | 'egg' | 'certificate' | 'chair'>> = {
  carpet: 'floor',
  egg: 'egg',
  certificate: 'certificate',
  chair: 'chair',
}

// beauty only counts on the main island, from the start; the floating pop waits for score:on
export function beauty(w: World, n: number, x: number, y: number): void {
  if (!w.main[y * w.width + x]) return
  w.score += n
  if (w.flags['score:on']) w.pops.push({ x, y, text: n > 0 ? `+${n}` : `${n}`, at: w.time })
}

// The island grows by the orb boiling a sea tile into salt, and by salt in hand filling one in.
// A crust once laid stays laid: there is no picking it back up. Anything else the bag puts down is here too.

// a new salt tile, from the orb or from the player's hand: it joins the main island if it touches
// it, and is only then worth a beauty. True if it did join.
export function makeSalt(w: World, x: number, y: number): boolean {
  const at = y * w.width + x
  w.tiles[at] = 'salt'
  const near = (dx: number, dy: number) =>
    x + dx >= 0 && x + dx < w.width && !!w.main[(y + dy) * w.width + x + dx]
  w.main[at] = near(-1, 0) || near(1, 0) || near(0, -1) || near(0, 1)
  beauty(w, -1, x, y)
  w.rev++
  return w.main[at]
}

// using one out of the bag on the tile at x,y: salt and the orb go in the sea, a carpet goes down on
// bare ground. 'used' is "it happened, with nothing to say about it"; null is "nothing happened".
export function useItem(
  w: World,
  item: Item,
  x: number,
  y: number,
): 'place' | 'away' | 'used' | null {
  const tile = tileAt(w, x, y)
  if ((w.inventory[item] ?? 0) < 1) return null
  if (item === 'salt') {
    if (tile !== 'water') return null
    const joined = makeSalt(w, x, y) // paving the sea over costs beauty, but only near home
    w.inventory.salt = (w.inventory.salt ?? 0) - 1
    return joined ? 'place' : 'away'
  }
  if (item === 'orb') {
    if (tile !== 'water') return null
    w.inventory.orb = (w.inventory.orb ?? 0) - 1
    // 2 s to boil, and where it was thrown from so the scene can arc it over
    w.objects.push({
      id: `orb${x}-${y}`,
      kind: 'orb',
      x,
      y,
      doneAt: w.time + 2000,
      thrown: { x: w.player.x, y: w.player.y, at: w.time },
    })
    w.rev++
    return 'used'
  }
  const kind = STANDS[item]
  if (!kind) return null // nothing else in the bag goes anywhere yet
  const ground = tile !== undefined && tile !== 'water' && tile !== 'rock'
  if (!ground || objectAt(w, x, y)) return null
  w.objects.push({ id: `${kind}${x}-${y}`, kind, x, y })
  w.inventory[item] = (w.inventory[item] ?? 0) - 1
  // 5 each, but the last of the carpet, the egg and the certificate to go down is worth whatever
  // brings beauty up to 15 in fives: that is everything there is, and 15 brings the sea horse
  const prizes = ['carpet', 'egg', 'certificate']
  let worth = 5
  if (prizes.includes(item)) {
    w.flags[`placed:${item}`] = true
    if (prizes.every((p) => w.flags[`placed:${p}`]))
      worth = Math.max(5, Math.ceil((15 - w.score) / 5) * 5)
  }
  beauty(w, worth, x, y) // beauty only ever counts at home
  w.rev++
  // laid out at sea it is worth nothing, and Walter says so
  return w.main[y * w.width + x] ? 'used' : 'away'
}
