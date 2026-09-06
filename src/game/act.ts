import { startSpin, startWalk } from './boat'
import { fireDone, startFire } from './cannon'
import { armMachine, putBy, startWall, wallDone } from './machine'
import { startTree, treeDone } from './tree'
import type { DialogueNode, World } from './world'

// Cutscene acts: a dialogue node without text. One starts as its node opens, and the node moves on
// by itself once it is over. The shake act stays in actions.ts, since it hands out a twig.

export function startAct(w: World, d: NonNullable<World['dialogue']>, to: DialogueNode): void {
  if (to.walk) startWalk(w, to.walk)
  if (to.wait !== undefined) d.until = w.time + to.wait
  if (to.rumble !== undefined) w.rumble = w.time + to.rumble
  const spawn = to.spawn
  if (spawn && !w.objects.some((o) => o.id === spawn.id)) w.objects.push(structuredClone(spawn))
  if (to.put) putBy(w, to.put)
  if (to.boom !== undefined) armMachine(w, to.boom)
  if (to.fire !== undefined) startFire(w, to.fire)
  if (to.wall) startWall(w, to.wall)
  const c = to.closeup
  if (c) {
    const since = w.closeup?.since ?? w.time // one already up keeps its black
    w.closeup = { sheet: c.sheet, frame: c.frame ?? 0, frames: c.frames ?? 1, at: w.time, since }
    w.rev++
  }
  if (to.spin !== undefined) startSpin(w, to.spin)
  const bar = w.objects.find((o) => o.id === to.drink) // no such bar: no drink, and that is all
  if (bar?.kind === 'bar') {
    bar.drink = true
    w.rev++
  }
  const f = w.objects.find((o) => o.id === to.bloom) // a missing flower just ends the act at once
  if (f?.kind === 'flower') f.bloomAt = w.time
  if (to.fly !== undefined || to.land !== undefined) startTree(w, to)
}

// is the open node's act over? Its dialogue then moves on by itself, with no interact
export function actDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
  const walk = node.walk
  if (walk) {
    const o = w.objects.find((x) => x.id === walk.id)
    return !o || (!o.step && !o.path?.length)
  }
  const bloom = node.bloom
  if (bloom) {
    const f = w.objects.find((o) => o.id === bloom)
    return !f || f.kind !== 'flower' || !!f.white
  }
  if (node.boom !== undefined) return !w.objects.some((o) => o.id === node.boom)
  if (node.fire !== undefined) return fireDone(w, node.fire)
  if (node.wall) return wallDone(w, node.wall.id)
  // the 500 ms fade for a single frame, and 400 ms a frame after that
  if (node.closeup) return !w.closeup || w.time >= w.closeup.at + 100 + w.closeup.frames * 400
  if (node.spin !== undefined) {
    const o = w.objects.find((x) => x.id === node.spin)
    return o?.kind !== 'npc' || o.spin === undefined
  }
  if (node.fly !== undefined || node.land !== undefined) return treeDone(w, node)
  if (node.wait !== undefined) return w.time >= (d.until ?? 0)
  if (node.rumble !== undefined) return w.time >= w.rumble
  return true // a spawn lands the moment the node opens, and a node with no act at all is over too
}
