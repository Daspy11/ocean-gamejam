import type { DialogueNode, Obj, World } from './world'

// The tree beats: shaking it for twigs, and a tree flying off or coming down during a cutscene.
function tree(w: World, id: string | undefined): Extract<Obj, { kind: 'tree' }> | undefined {
  const o = id === undefined ? undefined : w.objects.find((x) => x.id === id)
  return o?.kind === 'tree' ? o : undefined
}

// the shake act: the new count, which is what the caller fires tree:shake:<n> on. 0 = no such tree
export function shakeTree(w: World, id: string): number {
  const t = tree(w, id)
  if (!t) return 0
  t.shakes = (t.shakes ?? 0) + 1
  t.shookAt = w.time
  w.rev++
  return t.shakes
}

// fly and land are the same 1500 ms trip, up off the top of the island or back down onto it
export function startTree(w: World, node: DialogueNode): void {
  const off = tree(w, node.fly)
  const on = tree(w, node.land)
  if (off) off.flyAt = w.time
  if (on) on.landAt = w.time
  if (off || on) w.rev++
}

// a fly act is over once the tree is gone (tickTrees takes it away), a land act 1500 ms in
export function treeDone(w: World, node: DialogueNode): boolean {
  if (node.fly !== undefined) return !w.objects.some((o) => o.id === node.fly)
  const t = tree(w, node.land)
  return !t || w.time >= (t.landAt ?? 0) + 1500
}

// per tick: a tree that took off is gone 1500 ms later. True when a promised tree the player has
// left alone for a minute is close enough to say hi again.
export function tickTrees(w: World): boolean {
  const promised = !!w.flags['tree:promised']
  let near = false
  for (const o of [...w.objects]) {
    if (o.kind !== 'tree') continue
    if (o.flyAt !== undefined && w.time >= o.flyAt + 1500) {
      w.objects.splice(w.objects.indexOf(o), 1)
      w.rev++
    } else if (
      promised &&
      o.shookAt !== undefined &&
      w.time - o.shookAt >= 60000 &&
      Math.max(Math.abs(o.x - w.player.x), Math.abs(o.y - w.player.y)) <= 3
    )
      near = true
  }
  return near
}
