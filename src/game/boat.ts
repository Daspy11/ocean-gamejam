import { findPath } from './path'
import { DIRS, KINDS, tileAt } from './world'
import type { DialogueNode, Obj, World } from './world'

// Scripted walking: an npc on foot, a boat under sail, and whoever is standing on the boat.

// a node's `walk` act opens: a `to` or a `near` is found a way once, here, since the player is held
// while the act runs and nothing else moves into the way. No way there at all and he stays put, and
// the act is over. A missing object just ends the act at once.
export function startWalk(w: World, walk: NonNullable<DialogueNode['walk']>): void {
  const o = w.objects.find((x) => x.id === walk.id)
  if (!o) return
  if (o.kind === 'npc') delete o.ride // a walk of his own gets him off whatever he was riding
  if (walk.push !== undefined && w.objects.some((x) => x.id === walk.push)) o.push = walk.push
  // `near` walks up to somebody or something: his tile is the destination, and a character on it
  // stops the walk short like any `to`; a solid thing is stepped onto, less the last step
  const near =
    walk.near === undefined
      ? undefined
      : walk.near === 'player'
        ? w.player
        : w.objects.find((x) => x.id === walk.near)
  const to = near ?? walk.to
  const path = to ? findPath(w, o, to, !!near) : [...(walk.path ?? [])]
  o.path = path ?? [] // no way there: he stays put, and does not so much as turn
  if (o.kind === 'npc' && path) {
    if (walk.facing) o.face = walk.facing
    let [x, y] = [o.x, o.y]
    for (const d of path) {
      x += DIRS[d][0]
      y += DIRS[d][1]
    }
    const [dx, dy] = to ? [to.x - x, to.y - y] : [0, 0]
    // short of the tile: somebody is standing on it, and he ends up looking at him
    if (dx || dy)
      o.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    else if (near && path.length) o.face = o.path.pop()
  }
  o.run = walk.run
  stepObj(w, o, 0)
}

// a `walk` act naming the player: the same A* as anyone else, but his path lives on him, and only
// a cutscene ever puts one there.
export function walkPlayer(w: World, walk: NonNullable<DialogueNode['walk']>): void {
  const p = w.player
  const me: Obj = { id: 'player', kind: 'npc', sprite: 'player', dialogue: '', ...p }
  const near = walk.near === undefined ? undefined : w.objects.find((x) => x.id === walk.near)
  const to = near ?? walk.to
  const path = to ? findPath(w, me, to, !!near) : [...(walk.path ?? [])]
  p.path = path ?? []
  p.face = walk.facing ?? (near && p.path.length ? p.path.pop() : undefined)
  delete p.ride // walking gets him off whatever he was standing on
}

// a node's `ride` act: he gets on what it names and is carried by it from there
export function mount(w: World, ride: NonNullable<DialogueNode['ride']>): void {
  if (ride.id === 'player') w.player.ride = ride.on
  else {
    const o = w.objects.find((x) => x.id === ride.id)
    if (o?.kind === 'npc') o.ride = ride.on
  }
  w.rev++
}

// per tick: the player takes the next step of a scripted walk, or the tile of whatever carries him
function tickPlayer(w: World): void {
  const p = w.player
  if (p.ride) {
    const on = w.objects.find((o) => o.id === p.ride)
    if (!on) delete p.ride
    else [p.x, p.y, p.step] = [on.x, on.y, on.step ?? null]
    return
  }
  if (p.step) return
  const dir = p.path?.shift()
  if (!dir) {
    if (!p.face) return
    p.facing = p.face // the walk is done: he turns the way it left him facing
    delete p.face
    w.rev++
    return
  }
  p.facing = dir
  p.step = { x: p.x + DIRS[dir][0], y: p.y + DIRS[dir][1], t: 0 }
  w.rev++
}

// takes the next tile off a scripted walk. A cutscene walk passes through everything, player and
// solid objects alike: a blocked npc would stall the story. A boat is the exception, since it only
// floats: the first tile in its way that is not open water wrecks it and ends the walk there.
export function stepObj(w: World, o: Obj, t: number): void {
  const dir = o.path?.shift()
  if (!dir) {
    // the walk is done: whoever walked up to somebody turns and looks at him
    if (o.kind === 'npc' && o.face) {
      o.facing = o.face
      delete o.face
      w.rev++
    }
    return
  }
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

// a node's `spin` act: he whirls for 2 s and ends facing the way he was. Nobody by that id, or not
// an npc, and the act is over at once.
export function startSpin(w: World, id: string): void {
  const o = w.objects.find((x) => x.id === id)
  if (o?.kind !== 'npc') return
  o.face = o.facing
  o.spin = w.time + 2000
}

// per tick: everything mid-step moves on, and then riders take the tile and step of what they ride
export function tickWalks(w: World, dt: number): void {
  tickPlayer(w)
  // a spinning npc turns a quarter every 50 ms; scenes draw facing every frame like step progress,
  // so the turns bump no rev, only the stop
  for (const o of w.objects) {
    if (o.kind !== 'npc' || o.spin === undefined) continue
    if (w.time < o.spin) {
      o.facing = (['down', 'left', 'up', 'right'] as const)[Math.floor(w.time / 50) % 4]
      continue
    }
    o.facing = o.face ?? o.facing
    delete o.face
    delete o.spin
    w.rev++
  }
  const shoved = new Set(w.objects.map((o) => o.push))
  for (const o of w.objects) {
    // a rider is carried and a pushed thing is shoved: neither steps for itself
    if (!o.step || (o.kind === 'npc' && o.ride) || shoved.has(o.id)) continue
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
  // and the pushing: what he shoves is always the step ahead of his, so it leads him round every
  // corner, and on his last step it swings out to wherever he will be facing when he stops
  for (const o of w.objects) {
    if (!o.push || o.kind !== 'npc') continue
    const it = w.objects.find((x) => x.id === o.push)
    const [dx, dy] = DIRS[o.path?.[0] ?? o.face ?? o.facing]
    if (it && o.step) {
      it.x = o.step.x
      it.y = o.step.y
      it.step = { x: o.step.x + dx, y: o.step.y + dy, t: o.step.t }
    } else if (it?.step) {
      it.x = o.x + dx
      it.y = o.y + dy
      it.step = null
    }
    if (!o.step && !o.path?.length) delete o.push // the walk is over: it stays where he left it
  }
}
