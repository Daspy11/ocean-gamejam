import { DIRS, KINDS, tileAt } from './world'
import type { Obj, World } from './world'

// Scripted walking: an npc on foot, a boat under sail, and whoever is standing on the boat.

// takes the next tile off a scripted walk. A cutscene walk passes through everything, player and
// solid objects alike: a blocked npc would stall the story. A boat is the exception, since it only
// floats: the first tile in its way that is not open water wrecks it and ends the walk there.
export function stepObj(w: World, o: Obj, t: number): void {
  const dir = o.path?.shift()
  if (!dir) return
  const [dx, dy] = DIRS[dir]
  if (o.kind === 'boat') {
    let afloat = true
    for (let j = 0; j < KINDS.boat.h; j++)
      for (let i = 0; i < KINDS.boat.w; i++)
        if (tileAt(w, o.x + dx + i, o.y + dy + j) !== 'water') afloat = false
    if (!afloat) {
      o.path = []
      o.wrecked = true
      w.rev++
      return
    }
  }
  if (o.kind === 'npc') o.facing = dir
  o.step = { x: o.x + dx, y: o.y + dy, t }
}

// per tick: everything mid-step moves on, and then riders take the tile and step of what they ride
export function tickWalks(w: World, dt: number): void {
  for (const o of w.objects) {
    if (!o.step || (o.kind === 'npc' && o.ride)) continue // a rider is carried, it never steps
    const ms = o.run ? 125 : 250 // ms per tile: 250 walking, 125 running
    o.step.t += dt / ms // progress alone is not a visible change, so no rev
    if (o.step.t < 1) continue
    const leftover = (o.step.t - 1) * ms
    o.x = o.step.x
    o.y = o.step.y
    o.step = null
    o.parity = !o.parity
    w.rev++
    stepObj(w, o, leftover / ms) // keeps the speed constant across the boundary
  }
  // after the walking, so a rider is never a tick behind the deck he is standing on
  for (const o of w.objects) {
    if (o.kind !== 'npc' || !o.ride) continue
    const under = w.objects.find((r) => r.id === o.ride)
    if (!under) {
      delete o.ride // whatever he was standing on has gone; he is on his own feet from here
      continue
    }
    o.x = under.x
    o.y = under.y
    o.step = under.step // the very same step, so he and the deck can never drift apart
  }
}
