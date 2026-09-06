import { beauty } from './salt'
import { KINDS } from './world'
import type { Obj, World } from './world'

// Etarp's cannon. The `fire` act shells the main island from the muzzle down for 4 seconds: every
// grass tile and every tile with something to wreck on it gets a shot, in a random order, spread
// evenly over the time. A shot chars its grass for good, 3 beauty a tile, and whatever stood there
// is gone. The balls themselves are only for show: each flies straight down out of the muzzle and
// off the map, and hits nothing.

// what a shot leaves standing: the cast, the cannon, its own balls, the orb and the sea horse's wall
const SPARED = ['npc', 'cannon', 'ball', 'cinder', 'orb', 'cave']
const doomed = (o: Obj) => !SPARED.includes(o.kind)
const covers = (o: Obj, x: number, y: number) =>
  x >= o.x && x < o.x + KINDS[o.kind].w && y >= o.y && y < o.y + KINDS[o.kind].h

// the sim's one source of randomness: a plain lcg off world.seed, so a run is the same every time
function rnd(w: World): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0
  return w.seed / 4294967296
}

// a node's `fire` act: the tiles it will hit are picked and shuffled now, and the shots are spread
// evenly over the 4 seconds. No such cannon, and the act is over at once.
export function startFire(w: World, id: string): void {
  const c = w.objects.find((o) => o.id === id)
  if (c?.kind !== 'cannon') return
  const work: number[] = []
  for (let i = 0; i < w.tiles.length; i++) {
    const x = i % w.width
    const y = Math.floor(i / w.width)
    if (!w.main[i] || y < c.y) continue // it only ever fires down the island
    if (w.tiles[i] === 'grass' || w.objects.some((o) => doomed(o) && covers(o, x, y))) work.push(i)
  }
  for (let i = work.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(w) * (i + 1))
    ;[work[i], work[j]] = [work[j], work[i]]
  }
  c.firing = { work, every: 4000 / work.length, nextAt: w.time, shot: 0 }
  w.rev++
}

// the act is over with the last shot; the balls still in the air are nobody's business
export function fireDone(w: World, id: string): boolean {
  const c = w.objects.find((o) => o.id === id)
  return c?.kind !== 'cannon' || !c.firing
}

// one shot: whatever stood on the tile is gone, and grass is charred, at a cost
function hit(w: World, x: number, y: number): void {
  for (const o of [...w.objects])
    if (doomed(o) && covers(o, x, y)) w.objects.splice(w.objects.indexOf(o), 1)
  const at = y * w.width + x
  if (w.tiles[at] !== 'grass') return
  w.tiles[at] = 'charred'
  beauty(w, -3, x, y)
}

export function tickCannons(w: World): void {
  for (const c of w.objects) {
    if (c.kind !== 'cannon' || !c.firing) continue
    const f = c.firing
    while (f.work.length && w.time >= f.nextAt) {
      const at = f.work.shift()!
      hit(w, at % w.width, Math.floor(at / w.width))
      w.objects.push({ id: `ball${f.shot++}`, kind: 'ball', x: c.x, y: c.y, at: f.nextAt })
      f.nextAt += f.every
      w.rev++
    }
    if (!f.work.length) {
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
