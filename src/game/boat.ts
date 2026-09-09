import { findPath } from './path'
import { DIRS, KINDS, objectAt, tileAt } from './world'
import type { DialogueNode, Dir, Obj, World } from './world'

// Scripted walking: an npc on foot, a boat under sail, and whoever is standing on the boat.

// a node's `walk` act opens: a `to` or a `near` is found a way once, here, since the player is held
// while the act runs and nothing else moves into the way. No way there at all and he stays put, and
// the act is over. A missing object just ends the act at once.
export const LIFT = 1000 // ms a landed carpet takes to climb back to height before it moves off

export function startWalk(w: World, walk: NonNullable<DialogueNode['walk']>): void {
  const o = w.objects.find((x) => x.id === walk.id)
  if (!o) return
  if (o.kind === 'npc') delete o.ride // a walk of his own gets him off whatever he was riding
  // a carpet on the ground goes up before it goes anywhere: its steps wait on the climb
  if (o.kind === 'flyingcarpet' && o.landAt !== undefined) {
    delete o.landAt
    const crew = [w.player, ...w.objects.filter((r) => r.kind === 'npc')]
    o.liftAt = Math.max(
      w.time,
      ...crew.map((r) => (r.ride === o.id && r.hop ? r.hop.at + hopMs(r.hop, o) : w.time)),
    )
  }
  if (walk.push !== undefined && w.objects.some((x) => x.id === walk.push)) o.push = walk.push
  // `near` walks up to somebody or something: his tile is the destination, and a character on it
  // stops the walk short like any `to`; a solid thing is stepped onto, less the last step
  const near =
    walk.near === undefined
      ? undefined
      : walk.near === 'player'
        ? w.player
        : w.objects.find((x) => x.id === walk.near)
  let to = near ?? walk.to
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' } as const
  if (walk.retreat !== undefined && near && 'kind' in near && near.kind === 'npc') {
    const back =
      walk.retreat === 0
        ? opposite[near.facing]
        : (['left', 'up', 'down', 'right'] as const).find((dir) => {
            const [dx, dy] = DIRS[dir]
            return Array.from({ length: walk.retreat! }, (_, i) => i + 1).every((n) => {
              const [x, y] = [near.x + dx * n, near.y + dy * n]
              return (
                tileAt(w, x, y) === 'salt' &&
                !objectAt(w, x, y) &&
                !(w.player.x === x && w.player.y === y)
              )
            })
          })
    if (!back) return
    near.facing = opposite[back]
    for (const rider of w.objects)
      if (rider.kind === 'npc' && rider.ride === o.id) rider.facing = back
    const [dx, dy] = DIRS[near.facing]
    const gap = walk.retreat ? 3 : 2
    to = { x: near.x + dx * gap, y: near.y + dy * gap }
  }
  o.back = !!walk.back
  const path =
    walk.back && o.kind === 'npc'
      ? Array<Dir>(walk.back).fill(opposite[o.facing])
      : to
        ? findPath(w, o, to, !!near)
        : [...(walk.path ?? [])]
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

// a node's `ride` act: he gets on what it names and is carried by it from there. Nobody teleports
// aboard: he jumps from wherever he is standing, and the scene arcs him over from the tile he
// sprang off (`hop`); whoever is up on his head is drawn on him, so he goes along with the arc.
// Climbing onto somebody holds the scene until he is down; a jump onto a deck does not, so a
// crew boards together rather than one politely after another.
// how long a jump takes: a hop next door is quick, a leap across the deck takes longer
export const hopMs = (
  from: { x: number; y: number; duration?: number },
  to: { x: number; y: number },
) => from.duration ?? 260 + 90 * (Math.abs(to.x - from.x) + Math.abs(to.y - from.y))

export function mount(w: World, ride: NonNullable<DialogueNode['ride']>): void {
  const on = w.objects.find((x) => x.id === ride.on)
  const npc = w.objects.find((x) => x.id === ride.id)
  const o = ride.id === 'player' ? w.player : npc?.kind === 'npc' ? npc : undefined
  if (!o || !on) return
  o.ride = ride.on
  delete o.path
  delete o.face
  // already stood on it (a spawn that rides, say): he is simply on, with nothing to jump
  if (o.x !== on.x || o.y !== on.y || on.kind === 'npc')
    o.hop = { x: o.x, y: o.y, at: w.time, duration: hopMs(o, on) }
  for (const rider of [w.player, ...w.objects.filter((r) => r.kind === 'npc')]) carry(w, rider)
  w.rev++
}

// Resolve the whole stack so object order cannot leave a passenger one frame behind.
function carry(w: World, o: { x: number; y: number; ride?: string; step?: Obj['step'] }): void {
  if (!o.ride) return
  let on = w.objects.find((r) => r.id === o.ride)
  const seen = new Set<string>()
  while (on?.kind === 'npc' && on.ride && !seen.has(on.id)) {
    seen.add(on.id)
    const id = on.ride
    on = w.objects.find((r) => r.id === id)
  }
  if (!on || seen.has(on.id)) {
    delete o.ride
    o.step = null
    return
  }
  ;[o.x, o.y, o.step] = [on.x, on.y, on.step ?? null]
}

// he is down: on a deck he turns side-on, since a deck faces the way it travels
function tickHop(
  w: World,
  o: { x: number; y: number; hop?: Obj['thrown']; ride?: string; facing: Dir },
): void {
  if (!o.hop || w.time < o.hop.at + hopMs(o.hop, o)) return
  delete o.hop
  const on = w.objects.find((x) => x.id === o.ride)
  if (on && on.kind !== 'npc') o.facing = o.facing === 'left' ? 'left' : 'right'
  w.rev++
}

// climbing onto somebody is over once he is down. A jump onto a deck is over at the top of the
// arc, so the next one aboard is off the ground before this one lands and a crew boards as one.
export function rideDone(w: World, ride: NonNullable<DialogueNode['ride']>): boolean {
  const npc = w.objects.find((x) => x.id === ride.id)
  const o = ride.id === 'player' ? w.player : npc?.kind === 'npc' ? npc : undefined
  if (!o?.hop) return true
  const head = w.objects.find((x) => x.id === ride.on)?.kind === 'npc'
  return w.time >= o.hop.at + hopMs(o.hop, o) / (head ? 1 : 2)
}

// per tick: the player takes the next step of a scripted walk, or the tile of whatever carries him
function tickPlayer(w: World): void {
  const p = w.player
  if (p.ride) return
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
  if (o.kind === 'npc' && !o.back) o.facing = dir
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
    // a carpet just off the ground has its second of climbing before it takes its first step
    const elapsed =
      o.kind === 'flyingcarpet' && o.liftAt !== undefined
        ? Math.max(0, Math.min(dt, w.time - o.liftAt - LIFT))
        : dt
    const ms = o.run ? 125 : 250 // ms per tile: 250 walking, 125 running
    o.step.t += elapsed / ms // progress alone is not a visible change, so no rev
    while (o.step && o.step.t >= 1) {
      const leftover = o.step.t - 1
      o.x = o.step.x
      o.y = o.step.y
      o.step = null
      o.parity = !o.parity
      w.rev++
      stepObj(w, o, leftover) // consumes every crossed tile, even after a slow frame
    }
  }
  // after the walking, so a rider is never a tick behind the deck he is standing on
  carry(w, w.player)
  for (const o of w.objects) if (o.kind === 'npc') carry(w, o)
  // and after that, since how long a jump takes is how far it was: a rider is on his deck's tile
  tickHop(w, w.player)
  for (const o of w.objects) if (o.kind === 'npc') tickHop(w, o)
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
