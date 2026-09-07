import { beauty } from './salt'
import { objectAt, tileAt, type Obj, type World } from './world'

// Etarp's cannon. The `fire` act is 4 seconds of noise: a ball leaves the muzzle every 20 ms and
// flies straight off the map in a 30 degree cone to the left, where the sea horse is, and hits
// nothing. Nothing on the island is broken, but every third ball drops short and buries itself
// in the ground somewhere down the cone, and a cannonball stuck in your island is an eyesore.

// the sim's one source of randomness: a plain lcg off world.seed, so a run is the same every time
function rnd(w: World): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0
  return w.seed / 4294967296
}

// a node's `fire` act. No such cannon, and the act is over at once.
export function startFire(w: World, id: string): void {
  const c = w.objects.find((o) => o.id === id)
  if (c?.kind !== 'cannon') return
  c.firing = { until: w.time + 4000, ballAt: w.time, shot: 0 }
  w.rev++
}

// the act is over with the last ball out; the ones still in the air are nobody's business
export function fireDone(w: World, id: string): boolean {
  const c = w.objects.find((o) => o.id === id)
  return c?.kind !== 'cannon' || !c.firing
}

// one ball in three sticks where it fell: a random distance down the cone, at the angle it flew.
// Only bare ground takes one, so the sea, and anything already standing there, is left alone.
function embed(w: World, c: Obj, dir: number): void {
  const d = 1 + Math.floor(rnd(w) * c.x) // how far out to the left, all of it still on the map
  const [x, y] = [c.x - d, c.y + Math.round(d * Math.tan((dir * Math.PI) / 180))]
  const t = tileAt(w, x, y)
  if (!t || t === 'water' || objectAt(w, x, y)) return
  w.objects.push({ id: `embedded${x}-${y}`, kind: 'embedded', x, y })
  beauty(w, -3, x, y)
  w.rev++
}

export function tickCannons(w: World): void {
  for (const c of w.objects) {
    if (c.kind !== 'cannon' || !c.firing) continue
    const f = c.firing
    while (f.ballAt < f.until && w.time >= f.ballAt) {
      const dir = (rnd(w) * 2 - 1) * 15 // degrees off straight left, either way
      w.objects.push({ id: `ball${f.shot++}`, kind: 'ball', x: c.x, y: c.y, at: f.ballAt, dir })
      if (f.shot % 3 === 0) embed(w, c, dir)
      f.ballAt += 20
      w.rev++
    }
    if (w.time >= f.until) {
      delete c.firing
      w.rev++
    }
  }
  // a ball is 1500 ms in the air at 24 tiles a second: well off the map from anywhere it can fire
  for (const b of [...w.objects])
    if (b.kind === 'ball' && w.time - b.at >= 1500) {
      w.objects.splice(w.objects.indexOf(b), 1)
      w.rev++
    }
}
