import { beauty, makeSalt } from './salt'
import { KINDS, objectAt, tileAt } from './world'
import type { Obj, World } from './world'

// The desalinator 9000. Put down beside its owner, it drains a beauty every 2 seconds, and a `boom`
// act blows it up, crusting the sea over for seven tiles around.

// where it can go: his left before anything else, then the nearest ground working outwards
const SPOTS = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
  [-2, 0],
  [0, -2],
  [0, 2],
  [2, 0],
]

// a node's `put` act: stands its object on the first of those tiles that is bare ground with nobody
// on it. Nobody to put it down beside, or one out already, and nothing happens.
export function putBy(w: World, put: { by: string; obj: Obj }): boolean {
  const by = w.objects.find((o) => o.id === put.by)
  if (!by || w.objects.some((o) => o.id === put.obj.id)) return false
  const cannon = put.obj.kind === 'cannon'
  const right = put.obj.kind === 'cannon' && put.obj.right
  // Cannons stay on the firing line instead of falling back above or behind their owner.
  const spots = cannon
    ? Array.from({ length: w.width }, (_, i) => [(right ? 1 : -1) * (i + 1), 0])
    : SPOTS
  for (const [dx, dy] of spots) {
    const x = by.x + dx
    const y = by.y + dy
    const tile = tileAt(w, x, y)
    const ground = tile !== undefined && tile !== 'water' && tile !== 'rock'
    const occupied = cannon
      ? w.objects.some(
          (o) =>
            o.kind !== 'embedded' &&
            o.kind !== 'floor' &&
            x >= o.x &&
            x < o.x + KINDS[o.kind].w &&
            y >= o.y &&
            y < o.y + KINDS[o.kind].h,
        )
      : !!objectAt(w, x, y)
    if (!ground || occupied || (w.player.x === x && w.player.y === y)) continue
    const placed = { ...structuredClone(put.obj), x, y }
    if (cannon)
      w.objects.unshift(placed) // collision checks must find the cannon before its floor
    else w.objects.push(placed)
    w.rev++
    return true
  }
  return false
}

// a node's `boom` act: the machine it names goes off two seconds after the line that armed it
export function armMachine(w: World, id: string): void {
  const m = w.objects.find((o) => o.id === id)
  if (m?.kind === 'machine') m.boomAt = w.time + 2000
}

export function tickMachines(w: World): void {
  for (const m of [...w.objects]) {
    if (m.kind !== 'machine') continue
    if (m.nextAt === undefined) m.nextAt = w.time + 2000 // it starts counting where it lands
    if (w.time >= m.nextAt) {
      m.nextAt = w.time + 2000
      beauty(w, -1, m.x, m.y) // it keeps eating for as long as it is left running
      w.rev++
    }
    if (m.boomAt === undefined || w.time < m.boomAt) continue
    w.objects.splice(w.objects.indexOf(m), 1) // the prototype explodes
    const pops = w.pops.length
    const had = w.score
    blast(w, m.x, m.y)
    // one pop for the whole blast: several hundred of them at once would be a blizzard
    w.pops.splice(pops)
    if (w.flags['score:on'] && w.score < had)
      w.pops.push({ x: m.x, y: m.y, text: `${w.score - had}`, at: w.time })
    w.rumble = w.time + 800
  }
}

// a disc of crust 7 tiles out from x,y, every sea tile inside the circle crusting over. makeSalt
// joins a tile to home only off the tiles laid before it, so the far side of the disc is joined up
// afterwards, working out from home until nothing more touches it: the whole crust is home.
export function blast(w: World, x0: number, y0: number): void {
  for (let y = y0 - 7; y <= y0 + 7; y++)
    for (let x = x0 - 7; x <= x0 + 7; x++)
      if ((x - x0) ** 2 + (y - y0) ** 2 <= 7 * 7 && tileAt(w, x, y) === 'water') makeSalt(w, x, y)
  for (let grew = true; grew;) {
    grew = false
    for (let i = 0; i < w.tiles.length; i++) {
      if (w.main[i] || w.tiles[i] === 'water') continue
      const x = i % w.width
      const near =
        (x > 0 && w.main[i - 1]) ||
        (x < w.width - 1 && w.main[i + 1]) ||
        w.main[i - w.width] ||
        w.main[i + w.width]
      if (near) w.main[i] = grew = true
    }
  }
}
