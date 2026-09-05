import { beauty, objectAt, tileAt } from './world'
import type { Item, World } from './world'

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
  if (item !== 'carpet') return null // nothing else in the bag goes anywhere yet
  const ground = tile === 'salt' || tile === 'sand' || tile === 'grass' || tile === 'farm'
  if (!ground || objectAt(w, x, y)) return null
  w.objects.push({ id: `floor${x}-${y}`, kind: 'floor', x, y })
  w.inventory.carpet = (w.inventory.carpet ?? 0) - 1
  beauty(w, 5, x, y) // fashionable, but beauty only ever counts at home
  w.rev++
  // laid out at sea it is worth nothing, and Walter says so
  return w.main[y * w.width + x] ? 'used' : 'away'
}
