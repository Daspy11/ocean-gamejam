import { DIRS, KINDS, tileAt } from './world'
import type { Dir, Obj, World } from './world'

// A* for a `walk` act with a `to`. How a character moves is who he is: a flyer is stopped by nothing
// but another flyer, a swimmer by rock, solid objects and anyone else on the ground, and everyone
// else by the water as well. Another character is never a wall, only a very dear tile, so a route
// through one is taken when there is no other, and the player is the cheapest to push past. Nobody
// ends a walk on top of somebody: a `to` with a character on it ends on the closest free tile.
export const MODES: Record<string, 'fly' | 'swim'> = {
  albatross: 'fly',
  seahorse: 'swim',
  walter: 'swim', // a crab: he comes ashore out of the sea
}

// what each tile costs `mover` to step onto: 1 for open ground, Infinity for a wall
function costs(w: World, mover: Obj): number[] {
  const mode = mover.kind === 'npc' ? MODES[mover.sprite] : undefined
  const cost = w.tiles.map((t) => {
    if (mode === 'fly') return 1
    return t === 'rock' || (t === 'water' && mode !== 'swim') ? Infinity : 1
  })
  const raise = (x: number, y: number, c: number) => {
    const i = y * w.width + x
    if (tileAt(w, x, y) !== undefined) cost[i] = Math.max(cost[i], c) // a wall stays a wall
  }
  for (const o of w.objects) {
    if (o === mover || o.id === mover.push) continue // what he pushes is never in his own way
    const flyer = o.kind === 'npc' && MODES[o.sprite] === 'fly'
    // one in the air and one on the ground pass each other by. 1000 a character, so a route
    // through one loses to any detour the map can offer
    const c =
      mode === 'fly' || flyer
        ? mode === 'fly' && flyer
          ? 1000
          : 1
        : o.kind === 'npc'
          ? 1000
          : KINDS[o.kind].solid
            ? Infinity
            : 1
    for (let y = o.y; y < o.y + KINDS[o.kind].h; y++)
      for (let x = o.x; x < o.x + KINDS[o.kind].w; x++) raise(x, y, c)
  }
  if (mode !== 'fly') raise(w.player.x, w.player.y, 900) // a little less than anyone else
  return cost
}

// the cheapest route from where `mover` stands to `to`, as the steps to take; null when there is
// none. Four-way, so it is the walk the player could make, and Manhattan distance is a fair guess.
// A character standing on `to` is not walked onto: the route ends on the closest free tile to him
// that can be reached, the cheapest among equals, and the caller turns the mover to face him.
// `onto` lets a goal be stepped on whatever solid thing stands there, for walking up to a boat:
// the caller drops that last step and keeps its direction as the way to face.
export function findPath(
  w: World,
  mover: Obj,
  to: { x: number; y: number },
  onto = false,
): Dir[] | null {
  if (tileAt(w, to.x, to.y) === undefined) return null
  const cost = costs(w, mover)
  const width = w.width
  const start = mover.y * width + mover.x
  const goal = to.y * width + to.x
  const taken = cost.map(() => false) // where somebody stands
  taken[w.player.y * width + w.player.x] = true
  for (const o of w.objects) if (o !== mover && o.kind === 'npc') taken[o.y * width + o.x] = true
  if (onto && !taken[goal]) cost[goal] = 1
  const h = (i: number) => Math.abs((i % width) - to.x) + Math.abs(Math.floor(i / width) - to.y)
  const g = cost.map(() => Infinity)
  const from = cost.map((): Dir | null => null) // the step that first reached each tile cheapest
  const trace = (end: number) => {
    const path: Dir[] = []
    for (let i = end; i !== start;) {
      const d = from[i]!
      path.unshift(d)
      i -= DIRS[d][0] + DIRS[d][1] * width
    }
    return path
  }
  g[start] = 0
  const open = [start]
  while (open.length) {
    let best = 0
    for (let k = 1; k < open.length; k++)
      if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best])) best = k
    const at = open.splice(best, 1)[0]
    if (at === goal && !taken[goal]) return trace(goal)
    for (const d of Object.keys(DIRS) as Dir[]) {
      const x = (at % width) + DIRS[d][0]
      const y = Math.floor(at / width) + DIRS[d][1]
      if (tileAt(w, x, y) === undefined) continue
      const n = y * width + x
      if (g[at] + cost[n] >= g[n]) continue
      g[n] = g[at] + cost[n]
      from[n] = d
      if (!open.includes(n)) open.push(n)
    }
  }
  if (!taken[goal]) return null
  // somebody is on the goal, and every tile that can be reached is costed now: the closest one to
  // him that nobody stands on, or where the mover is if nothing beats it
  let end = start
  for (let i = 0; i < g.length; i++) {
    if (taken[i] || g[i] === Infinity) continue
    if (h(i) < h(end) || (h(i) === h(end) && g[i] < g[end])) end = i
  }
  return trace(end)
}
