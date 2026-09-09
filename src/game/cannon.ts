import { beauty } from './salt'
import { objectAt, tileAt, type Obj, type World } from './world'

// Etarp's cannon. The `fire` act is 4 seconds of noise: a ball leaves the muzzle every 20 ms and
// flies straight off the map in a 30 degree cone to the left, where the sea horse is, and hits
// nothing. A `right` cannon is the mirror of that, firing east: the sea horse's answer to it. Nothing on the island is broken, but every third ball drops short and buries itself
// in the ground somewhere down the cone, and a cannonball stuck in your island is an eyesore.

// the sim's one source of randomness: a plain lcg off world.seed, so a run is the same every time
function rnd(w: World): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0
  return w.seed / 4294967296
}

// a node's `fire` act. No such cannon, and the act is over at once.
export function startFire(w: World, id: string): void {
  const c = w.objects.find((o) => o.id === id)
  if (c?.kind !== 'cannon' || c.firing?.duel) return
  c.firing = { until: w.time + 4000, ballAt: w.time, shot: 0 }
  const opponent = w.objects.find((o) => o.kind === 'cannon' && !!o.right !== !!c.right)
  if (w.flags['fired:tarq'] && opponent?.kind === 'cannon') {
    // The first cue starts both guns; later cues leave the shared firing cadence alone.
    const rug = w.objects.find((o) => o.kind === 'flyingcarpet')
    const at = Math.max(w.time, rug?.liftAt ?? w.time) + 500
    for (const gun of [c, opponent])
      gun.firing = { until: at + 12000, ballAt: at, shot: 0, duel: true }
    for (const b of w.objects) if (b.kind === 'ball') b.life = 500
  }
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
  const back = c.kind === 'cannon' && c.right
  const d = 1 + Math.floor(rnd(w) * (back ? w.width - c.x : c.x)) // out down the cone, still on the map
  const [x, y] = [c.x + (back ? d : -d), c.y + Math.round(d * Math.tan((dir * Math.PI) / 180))]
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
      const off = (rnd(w) * 2 - 1) * 15 // degrees off straight down the barrel, either way
      const dir = c.right ? 180 - off : off // 180 is the same cone mirrored, so the ball flies east
      w.objects.push({
        id: `ball:${c.id}:${f.ballAt}`,
        kind: 'ball',
        x: c.x,
        y: c.y,
        at: f.ballAt,
        dir,
        life: f.duel ? 500 : 1500,
      })
      f.shot++
      if (f.duel) w.score-- // both guns together strip 100 beauty per second, without a flood of pops
      // the last scene is the two of them shelling each other over a beauty nobody is left to
      // mind, so nothing sticks in the ground from here on
      if (f.shot % 3 === 0 && !w.flags['fired:tarq']) embed(w, c, off)
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
    if (b.kind === 'ball' && w.time - b.at >= (b.life ?? 1500)) {
      w.objects.splice(w.objects.indexOf(b), 1)
      w.rev++
    }
}
