import { DIRS, tileAt, type Action, type Content, type World } from './world'

export function apply(w: World, a: Action, c: Content): void {
  if (a.type === 'tick') {
    w.time += a.dt
    w.player.cooldown = Math.max(0, w.player.cooldown - a.dt)
    for (const pool of w.tidepools)
      if (!pool.stone && w.time >= pool.nextAt) {
        pool.stone = true
        w.rev++
      }
    return
  }

  const d = w.dialogue
  if (d) {
    const npc = w.npcs.find((n) => n.id === d.npc)
    const dlg = npc && c.dialogues[npc.dialogue]
    const node = dlg?.nodes[d.node]
    if (!node) {
      // broken content: close rather than throw, a human fixes the json
      w.dialogue = null
      w.rev++
      return
    }
    if (a.type === 'move') {
      const count = node.choices?.length ?? 0
      if (count === 0) return
      const step = a.dir === 'up' ? -1 : a.dir === 'down' ? 1 : 0
      const at = Math.max(0, Math.min(count - 1, d.choice + step))
      if (at !== d.choice) {
        d.choice = at
        w.rev++
      }
      return
    }
    const chosen = node.choices?.[d.choice]
    if (chosen) Object.assign(w.flags, chosen.set)
    const next = chosen ? chosen.next : (node.next ?? null)
    const to = next === null ? undefined : dlg?.nodes[next]
    if (next === null || !to) w.dialogue = null
    else {
      Object.assign(w.flags, to.set)
      w.dialogue = { npc: d.npc, node: next, choice: 0 }
    }
    w.rev++
    return
  }

  if (a.type === 'move') {
    if (w.player.facing !== a.dir) {
      w.player.facing = a.dir
      w.rev++
    }
    if (w.player.cooldown > 0) return
    const [dx, dy] = DIRS[a.dir]
    const x = w.player.x + dx
    const y = w.player.y + dy
    const tile = tileAt(w, x, y)
    if (tile !== 'sand' && tile !== 'grass') return
    if (w.npcs.some((n) => n.x === x && n.y === y)) return
    if (w.tidepools.some((p) => p.x === x && p.y === y)) return
    w.player.x = x
    w.player.y = y
    w.player.cooldown = 160 // ms between steps, so a held key walks at a steady pace
    w.rev++
    return
  }

  const [dx, dy] = DIRS[w.player.facing]
  const x = w.player.x + dx
  const y = w.player.y + dy

  const npc = w.npcs.find((n) => n.x === x && n.y === y)
  if (npc) {
    const dlg = c.dialogues[npc.dialogue]
    const entry = dlg?.start.find((s) => !s.when || !!w.flags[s.when])
    const node = dlg && entry ? dlg.nodes[entry.node] : undefined
    if (!entry || !node) return
    Object.assign(w.flags, node.set)
    w.dialogue = { npc: npc.id, node: entry.node, choice: 0 }
    w.rev++
    return
  }

  const pool = w.tidepools.find((p) => p.x === x && p.y === y && p.stone)
  if (pool) {
    pool.stone = false
    pool.nextAt = w.time + 3000 // a pool takes 3s to grow the next stone
    w.inventory.stone = (w.inventory.stone ?? 0) + 1
    w.rev++
    return
  }

  const stone = w.inventory.stone ?? 0
  if (stone > 0 && tileAt(w, x, y) === 'water') {
    w.tiles[y * w.width + x] = 'sand'
    w.inventory.stone = stone - 1
    w.rev++
  }
}
