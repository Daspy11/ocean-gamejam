import { shakeTree, startTree, tickTrees, treeDone } from './tree'
import { DIRS, KINDS, objectAt, tileAt, type Action, type Content, type World } from './world'
import type { DialogueNode, Item, Obj } from './world'

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const
type Npc = Extract<Obj, { kind: 'npc' }>

// is the open node's act over? Its dialogue then moves on by itself, with no interact
function actDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
  const walk = node.walk
  if (walk) {
    const npc = w.objects.find((o) => o.id === walk.id)
    return !npc || npc.kind !== 'npc' || (!npc.step && !npc.path?.length)
  }
  const bloom = node.bloom
  if (bloom) {
    const f = w.objects.find((o) => o.id === bloom)
    return !f || f.kind !== 'flower' || !!f.white
  }
  if (node.fly !== undefined || node.land !== undefined) return treeDone(w, node)
  if (node.wait !== undefined) return w.time >= (d.until ?? 0)
  return true // a spawn lands the moment the node opens, and a node with no act at all is over too
}

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
  // takes the next tile off a scripted npc's path. A cutscene walk passes through everything,
  // player and solid objects alike: a blocked npc would stall the story.
  const stepNpc = (o: Npc, t: number) => {
    const dir = o.path?.shift()
    if (!dir) return
    o.facing = dir
    o.step = { x: o.x + DIRS[dir][0], y: o.y + DIRS[dir][1], t }
  }
  // both `start` and a branching `next` are read this way: first entry with no `when`, or whose
  // flag is truthy. Nothing matching means there is nowhere to go.
  const pick = (list: { when?: string; node: string }[] | undefined) =>
    list?.find((s) => !s.when || !!w.flags[s.when])?.node
  // opens key at node, or at the start the flags pick; `item` fills {item} in the text
  const open = (key: string, node?: string, item?: Item) => {
    const dlg = c.dialogues[key]
    const at = node ?? pick(dlg?.start)
    const to = at === undefined ? undefined : dlg?.nodes[at]
    if (at === undefined || !to) return false
    Object.assign(w.flags, to.set)
    if (to.take) take(to.take)
    w.dialogue = { key, node: at, choice: 0, item }
    w.rev++
    const walk = to.walk
    if (walk) {
      const npc = w.objects.find((o) => o.id === walk.id) // a missing npc just ends the act at once
      if (npc?.kind === 'npc') {
        npc.path = [...walk.path]
        npc.run = walk.run
        stepNpc(npc, 0)
      }
    }
    if (to.wait !== undefined) w.dialogue.until = w.time + to.wait
    const spawn = to.spawn
    if (spawn && !w.objects.some((o) => o.id === spawn.id)) w.objects.push(structuredClone(spawn))
    const bloom = to.bloom
    if (bloom) {
      const f = w.objects.find((o) => o.id === bloom) // a missing flower just ends the act at once
      if (f?.kind === 'flower') f.bloomAt = w.time
    }
    if (to.shake !== undefined) {
      const shakes = shakeTree(w, to.shake)
      if (shakes) {
        gain('twig') // the first twig's got box queues up behind the tree's own box
        fire(`tree:shake:${shakes}`)
      }
    }
    if (to.fly !== undefined || to.land !== undefined) startTree(w, to)
    return true
  }
  // leaving the open node: follow `next`, or close and let the queue in. Shared by an interact on
  // a text node and by an act finishing on its own.
  const advance = (d: NonNullable<World['dialogue']>, node: DialogueNode | undefined) => {
    const chosen = node?.choices?.[d.choice]
    if (chosen) Object.assign(w.flags, chosen.set)
    // a missing node is broken content: close rather than throw, a human fixes the json
    const next = node ? (chosen ? chosen.next : node.next) : null
    const to = (Array.isArray(next) ? pick(next) : next) ?? null
    if (to !== null && open(d.key, to, d.item)) return
    w.dialogue = null
    w.rev++
    const queued = w.queue.shift()
    if (queued) open(queued.key, undefined, queued.item)
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
  // a node's `take` spends one: the key goes when the last is gone, so the inventory drops the slot
  const take = (item: Item) => {
    const left = (w.inventory[item] ?? 0) - 1
    if (left > 0) w.inventory[item] = left
    else delete w.inventory[item]
    w.rev++
  }
  const gain = (item: Item) => {
    w.inventory[item] = (w.inventory[item] ?? 0) + 1
    w.rev++
    if (w.flags[`had:${item}`]) return
    w.flags[`had:${item}`] = true
    // the orb tutorial talks to whatever the cursor starts on, so the orb keeps the first slot
    if (item === 'orb') w.inventory = { orb: w.inventory.orb, ...w.inventory }
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
    for (const o of w.objects)
      if (
        o.kind === 'flower' &&
        o.bloomAt !== undefined &&
        !o.white &&
        w.time >= o.bloomAt + 1500
      ) {
        o.white = true // every flower that blooms is worth the same 10 beauty
        w.score += 10
        w.pops.push({ x: o.x, y: o.y, text: '+10', at: w.time })
        w.rev++
      }
    if (tickTrees(w)) fire('tree:near') // the promised tree, rested and back within three tiles
    const live = w.pops.filter((pop) => w.time - pop.at < 1500) // a pop floats for 1500 ms
    if (live.length !== w.pops.length) {
      w.pops = live
      w.rev++
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
    for (const o of w.objects) {
      if (o.kind !== 'npc' || !o.step) continue
      const npcMs = o.run ? 125 : 250
      o.step.t += a.dt / npcMs // progress alone is not a visible change, so no rev
      if (o.step.t < 1) continue
      const leftover = (o.step.t - 1) * npcMs
      o.x = o.step.x
      o.y = o.step.y
      o.step = null
      o.parity = !o.parity
      w.rev++
      stepNpc(o, leftover / npcMs) // keeps the speed constant across the boundary
    }
    const act = w.dialogue
    const on = act ? c.dialogues[act.key]?.nodes[act.node] : undefined
    if (act && on && on.text === undefined && actDone(w, act, on)) advance(act, on)
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
    if (node && node.text === undefined) return // an act runs to its end; input cannot skip it
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
    advance(d, node)
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
    fire(`talk:${obj.id}`) // a scene waiting on this npc cuts in ahead of their own lines
    if (!w.dialogue) open(obj.dialogue)
    obj.facing = OPP[p.facing] // the npc looks back at the player
    return
  }
  if (obj?.kind === 'sign') {
    open(obj.dialogue) // a sign just reads out; nothing turns and no one is talked to
    return
  }
  if (obj?.kind === 'boat') {
    open('boat') // the wreck reads out like a sign, with no one speaking
    return
  }
  if (obj?.kind === 'tree') {
    open(obj.dialogue ?? 'tree') // the shaking one by default; a tree with its own dialogue is talked to
    return
  }
  if (obj?.kind === 'crate') {
    if (obj.open) return // a crate hands over what it holds exactly once
    obj.open = true
    gain(obj.item)
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
    // once beauty is a thing, paving the sea over costs some of it
    if (w.flags['score:on']) {
      w.score -= 1
      w.pops.push({ x, y, text: '-1', at: w.time })
      fire('salt:place')
    }
    return
  }
  if ((w.inventory.orb ?? 0) > 0) {
    w.inventory.orb = (w.inventory.orb ?? 0) - 1
    // 2 s to boil, and where it was thrown from so the scene can arc it over
    w.objects.push({
      id: `orb${x}-${y}`,
      kind: 'orb',
      x,
      y,
      doneAt: w.time + 2000,
      thrown: { x: p.x, y: p.y, at: w.time },
    })
    w.rev++
  }
}
