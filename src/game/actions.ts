import { DIRS, KINDS, objectAt, tileAt, type Action, type Content, type World } from './world'
import type { Item } from './world'

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const

export function apply(w: World, a: Action, c: Content): void {
  const p = w.player
  const busy = w.dialogue !== null || w.menu !== null
  // two call sites: the start from standing and the restart at a tile boundary
  const startStep = (t: number) => {
    const [dx, dy] = DIRS[p.facing]
    const x = p.x + dx
    const y = p.y + dy
    const tile = tileAt(w, x, y)
    const obj = objectAt(w, x, y)
    // blocked: stand facing it, and no rev (a held key would otherwise spam it)
    if ((tile !== 'salt' && tile !== 'sand' && tile !== 'grass') || (obj && KINDS[obj.kind].solid))
      return
    p.step = { x, y, t }
    w.rev++
  }
  // opens key at node, or at the start the flags pick; `item` fills {item} in the text
  const open = (key: string, node?: string, item?: Item) => {
    const dlg = c.dialogues[key]
    const at = node ?? dlg?.start.find((s) => !s.when || !!w.flags[s.when])?.node
    const to = at === undefined ? undefined : dlg?.nodes[at]
    if (at === undefined || !to) return false
    Object.assign(w.flags, to.set)
    w.dialogue = { key, node: at, choice: 0, item }
    w.rev++
    return true
  }
  // a line the sim starts waits its turn rather than cutting off the box already on screen
  const play = (key: string, item?: Item) =>
    w.dialogue ? w.queue.push({ key, item }) : open(key, undefined, item)
  // every dialogue that asked for this event, whose `when` flag is set, and that has not played.
  // The whole pass is picked before any flag is written, so one beat cannot chain into the next.
  const fire = (e: string) => {
    const due = Object.entries(c.dialogues).filter(([key, dlg]) => {
      const t = dlg.trigger
      return t && t.event === e && !w.flags[`fired:${key}`] && (!t.when || w.flags[t.when])
    })
    for (const [key] of due) {
      w.flags[`fired:${key}`] = true
      play(key)
    }
  }
  const gain = (item: Item) => {
    w.inventory[item] = (w.inventory[item] ?? 0) + 1
    w.rev++
    if (w.flags[`had:${item}`]) return
    w.flags[`had:${item}`] = true
    play('got', item) // the first of anything ever picked up gets a "you got X" box
  }

  // record the controller even in a dialogue or the menu, so a release is never missed
  if (a.type === 'move') {
    p.held = a.dir
    p.run = !!a.run
  }

  if (a.type === 'tick') {
    w.time += a.dt
    for (const o of w.objects)
      if (o.kind === 'orb' && tileAt(w, o.x, o.y) === 'water' && w.time >= o.doneAt) {
        w.tiles[o.y * w.width + o.x] = 'salt' // the orb stays put, now sitting on the crust it boiled
        w.rev++
        fire('salt:spawn')
      }
    const ms = p.run ? 125 : 250 // ms per tile: 250 walking, 125 running
    // 100 ms turn delay: a tapped direction only turns, a held one walks
    if (!p.step && !busy && p.facing === p.held && w.time - p.turnedAt >= 100) startStep(0)
    if (p.step) {
      p.step.t += a.dt / ms // progress alone is not a visible change, so no rev
      if (p.step.t >= 1) {
        const leftover = (p.step.t - 1) * ms
        p.x = p.step.x
        p.y = p.step.y
        p.step = null
        p.parity = !p.parity
        w.rev++
        if (p.held && !busy) {
          if (p.facing !== p.held) {
            p.facing = p.held // already walking, so no turn delay
            w.rev++
          }
          startStep(leftover / ms) // keeps the speed constant across the boundary
        }
      }
    }
    return
  }

  if (a.type === 'menu') {
    if (w.dialogue || p.step) return
    w.menu = w.menu ? null : { screen: 'inventory', cursor: 0 }
    w.rev++
    if (!w.menu) fire('menu:close')
    return
  }

  if (a.type === 'talk') {
    if (!busy) open(a.key) // a scripted line waits for the box to be free; mid-step is fine
    return
  }

  const d = w.dialogue
  if (d) {
    const node = c.dialogues[d.key]?.nodes[d.node]
    if (node && a.type === 'move') {
      const count = node.choices?.length ?? 0
      const by = a.dir === 'up' ? -1 : a.dir === 'down' ? 1 : 0
      const at = Math.max(0, Math.min(count - 1, d.choice + by))
      if (count > 0 && at !== d.choice) {
        d.choice = at
        w.rev++
      }
      return
    }
    const chosen = node?.choices?.[d.choice]
    if (chosen) Object.assign(w.flags, chosen.set)
    // a missing node is broken content: close rather than throw, a human fixes the json
    const next = (node ? (chosen ? chosen.next : node.next) : null) ?? null
    if (next !== null && open(d.key, next, d.item)) return
    w.dialogue = null
    w.rev++
    const queued = w.queue.shift()
    if (queued) open(queued.key, undefined, queued.item)
    return
  }

  const m = w.menu
  if (m) {
    if (a.type === 'move' && a.dir) {
      const slots = Object.entries(w.inventory).filter(([, n]) => n > 0).length
      const by = a.dir === 'left' ? -1 : a.dir === 'right' ? 1 : a.dir === 'up' ? -5 : 5 // 5 per row
      const at = Math.max(0, Math.min(slots - 1, m.cursor + by))
      if (at !== m.cursor) {
        m.cursor = at
        w.rev++
      }
    }
    return // interact in the inventory does nothing yet
  }

  if (a.type === 'move') {
    if (!p.step && a.dir && p.facing !== a.dir) {
      p.facing = a.dir
      p.turnedAt = w.time // walking waits 100 ms from here, so a tap only turns
      w.rev++
    }
    return
  }

  if (p.step) return // you only interact while standing
  const x = p.x + DIRS[p.facing][0]
  const y = p.y + DIRS[p.facing][1]
  const obj = objectAt(w, x, y)
  if (obj?.kind === 'npc') {
    if (open(obj.dialogue)) obj.facing = OPP[p.facing] // the npc looks back at the player
    return
  }
  if (obj?.kind === 'crate') {
    if (obj.open) return // it only ever held the one orb
    obj.open = true
    gain('orb')
    fire('crate:open') // fired after the got box, so Mich's line queues up behind it
    return
  }
  if (obj?.kind === 'orb') {
    w.objects.splice(w.objects.indexOf(obj), 1) // boiling or finished, it always comes back to hand
    gain('orb')
    return
  }
  if (obj) return
  const tile = tileAt(w, x, y)
  if (tile === 'salt') {
    w.tiles[y * w.width + x] = 'water' // the crust the orb boiled is the salt: scoop it back up
    gain('salt')
    return
  }
  if (tile !== 'water') return
  const salt = w.inventory.salt ?? 0
  if (salt > 0) {
    w.tiles[y * w.width + x] = 'salt' // salt goes first, so the orb is never thrown out by accident
    w.inventory.salt = salt - 1
    w.rev++
    return
  }
  if ((w.inventory.orb ?? 0) > 0) {
    w.inventory.orb = (w.inventory.orb ?? 0) - 1
    w.objects.push({ id: `orb${x}-${y}`, kind: 'orb', x, y, doneAt: w.time + 2000 }) // 2 s to boil
    w.rev++
  }
}
