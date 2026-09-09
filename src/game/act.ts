import { mount, rideDone, startSpin, startWalk, walkPlayer } from './boat'
import { fireDone, startFire } from './cannon'
import { armMachine, putBy } from './machine'
import { startThrow, throwDone } from './throw'
import { startTree, treeDone } from './tree'
import { inside } from './world'
import type { Branch, DialogueNode, Item, World } from './world'

// Cutscene acts: a dialogue node without text. One starts as its node opens, and the node moves on
// by itself once it is over. The shake act stays in actions.ts, since it hands out a twig.

export function startAct(w: World, d: NonNullable<World['dialogue']>, to: DialogueNode): void {
  if (to.walk) (to.walk.id === 'player' ? walkPlayer : startWalk)(w, to.walk)
  if (to.wait !== undefined) d.until = w.time + to.wait
  if (to.after !== undefined) d.until = w.time + to.after
  if (to.rumble !== undefined) w.rumble = w.time + to.rumble
  const spawn = to.spawn
  if (spawn && !w.objects.some((o) => o.id === spawn.id)) w.objects.push(structuredClone(spawn))
  if (to.put) putBy(w, to.put)
  if (to.boom !== undefined) armMachine(w, to.boom)
  if (to.fire !== undefined) startFire(w, to.fire)
  const c = to.closeup
  if (c) {
    const since = w.closeup?.since ?? w.time // one already up keeps its black
    w.closeup = { sheet: c.sheet, frame: c.frame ?? 0, frames: c.frames ?? 1, at: w.time, since }
    if (c.zoom !== undefined) w.closeup.zoom = c.zoom
    if (c.burst) w.closeup.burst = null
    w.rev++
  } else if (c === null && w.closeup) {
    // a burst one lingers for the zoom back out; the tick drops it
    if (w.closeup.burst !== undefined && w.closeup.down === undefined) w.closeup.down = w.time
    else w.closeup = null
    w.rev++
  }
  if (to.burst && w.closeup?.burst === null) w.closeup.burst = w.time
  if (to.spin !== undefined) startSpin(w, to.spin)
  const turn = to.face && w.objects.find((o) => o.id === to.face?.id)
  if (turn?.kind === 'npc') {
    turn.facing = to.face!.dir
    w.rev++
  }
  if (to.throw) startThrow(w, to.throw, d.object)
  if (to.ride) mount(w, to.ride)
  const bar = w.objects.find((o) => o.id === to.drink) // no such bar: no drink, and that is all
  if (bar?.kind === 'bar') {
    bar.drink = true
    w.rev++
  }
  const f = w.objects.find((o) => o.id === to.bloom) // a missing flower just ends the act at once
  if (f?.kind === 'flower') f.bloomAt = w.time
  if (to.fly !== undefined || to.land !== undefined) startTree(w, to)
}

// does the open node move on by itself, with no interact? A text node only with an `after` time up
export function nodeDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
  if (node.text !== undefined) return node.after !== undefined && w.time >= (d.until ?? 0)
  return actDone(w, d, node)
}

// is the open node's act over? Its dialogue then moves on by itself, with no interact
function actDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
  const walk = node.walk
  if (walk) {
    const o = walk.id === 'player' ? w.player : w.objects.find((x) => x.id === walk.id)
    return !o || (!o.step && !o.path?.length)
  }
  const bloom = node.bloom
  if (bloom) {
    const f = w.objects.find((o) => o.id === bloom)
    return !f || f.kind !== 'flower' || !!f.white
  }
  if (node.boom !== undefined) return !w.objects.some((o) => o.id === node.boom)
  if (node.fire !== undefined) return fireDone(w, node.fire)
  if (node.clear) return !inside(w, node.clear)
  // the 500 ms fade for a single frame, and 400 ms a frame after that; a burst's zoom takes 1 s
  if (node.closeup === null) return true
  if (node.closeup !== undefined)
    return (
      !w.closeup ||
      w.time >= w.closeup.at + (w.closeup.burst === undefined ? 100 + w.closeup.frames * 400 : 1000)
    )
  // no circle to burst is nothing to wait for
  if (node.burst) return typeof w.closeup?.burst !== 'number' || w.time >= w.closeup.burst + 2000
  if (node.spin !== undefined) {
    const o = w.objects.find((x) => x.id === node.spin)
    return o?.kind !== 'npc' || o.spin === undefined
  }
  if (node.ride) return rideDone(w, node.ride)
  if (node.throw) return throwDone(w)
  if (node.fly !== undefined || node.land !== undefined) return treeDone(w, node)
  if (node.wait !== undefined) return w.time >= (d.until ?? 0)
  if (node.rumble !== undefined) return w.time >= w.rumble
  return true // a spawn lands the moment the node opens, and a node with no act at all is over too
}

// a burst close-up taken down is gone once the camera has had its second to ease back out
export function tickCloseup(w: World): void {
  const down = w.closeup?.down
  if (down !== undefined && w.time >= down + 1000) {
    w.closeup = null
    w.rev++
  }
}

// both `start` and a branching `next` are read this way: first entry whose `when` flag is truthy,
// whose `has` items are all in the bag and whose `in` the player stands in. Nothing matching
// means there is nowhere to go.
export function pickBranch(w: World, list: Branch[] | undefined): string | undefined {
  return list?.find(
    (s) =>
      (!s.when || !!w.flags[s.when]) &&
      (!s.in || inside(w, s.in)) &&
      Object.entries(s.has ?? {}).every(([item, n]) => (w.inventory[item as Item] ?? 0) >= n),
  )?.node
}
