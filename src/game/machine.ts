import { makeSalt } from './salt'
import { beauty, objectAt, tileAt } from './world'
import type { Obj, World } from './world'

// The desalinator 9000. Put down beside its owner, it drains a beauty every 2 seconds, and on the
// tenth cycle it goes up and crusts the sea over for three tiles around.

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
  for (const [dx, dy] of SPOTS) {
    const x = by.x + dx
    const y = by.y + dy
    const tile = tileAt(w, x, y)
    const ground = tile === 'salt' || tile === 'sand' || tile === 'grass' || tile === 'farm'
    if (!ground || objectAt(w, x, y) || (w.player.x === x && w.player.y === y)) continue
    w.objects.push({ ...structuredClone(put.obj), x, y })
    w.rev++
    return true
  }
  return false
}

export function tickMachines(w: World): void {
  for (const m of [...w.objects]) {
    if (m.kind !== 'machine') continue
    if (m.nextAt === undefined) m.nextAt = w.time + 2000 // it starts counting where it lands
    if (w.time < m.nextAt) continue
    m.nextAt = w.time + 2000
    m.left--
    beauty(w, -1, m.x, m.y)
    w.rev++
    if (m.left > 0) continue
    w.objects.splice(w.objects.indexOf(m), 1) // the prototype explodes, salting the sea round it
    for (let y = m.y - 3; y <= m.y + 3; y++)
      for (let x = m.x - 3; x <= m.x + 3; x++) if (tileAt(w, x, y) === 'water') makeSalt(w, x, y)
    w.rumble = w.time + 800
  }
}
