import { enterCave } from './map'
import { nodeDone, pickBranch, startAct, tickCloseup } from './act'
import { tickFarewell, tickWalks } from './boat'
import { tickCannons } from './cannon'
import { tickMachines } from './machine'
import { choices, tickThrow } from './throw'
import { shakeTree, tickFlowers, tickTrees } from './tree'
import { beauty, takeItem, tickOrbs, useItem } from './salt'
import { cueInteract, DIRS, KINDS, objectAt, tileAt } from './world'
import type { Action, Content, DialogueNode, Item, World } from './world'

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const

export function apply(w: World, a: Action, c: Content): void {
  const p = w.player
  // the node the box is on, if any: a `clear` act frees him to walk while the scene waits on it
  const cur = w.dialogue ? c.dialogues[w.dialogue.key]?.nodes[w.dialogue.node] : undefined
  const busy = (w.dialogue !== null && !cur?.clear) || w.menu !== null
  // two call sites: the start from standing and the restart at a tile boundary
  const startStep = (t: number) => {
    const [dx, dy] = DIRS[p.facing]
    const [x, y] = [p.x + dx, p.y + dy]
    const tile = tileAt(w, x, y)
    const obj = objectAt(w, x, y)
    // blocked: stand facing it, and no rev (a held key would otherwise spam it)
    const ground = tile !== undefined && tile !== 'water' && tile !== 'rock' // and off the map
    if (!ground || (obj && KINDS[obj.kind].solid)) return
    p.step = { x, y, t }
    w.rev++
  }
  // opens key at node, or at the start the flags pick; `item` fills {item} in the text
  const open = (key: string, node?: string, item?: Item, object?: string) => {
    const dlg = c.dialogues[key]
    const at = node ?? pickBranch(w, dlg?.start)
    const to = at === undefined ? undefined : dlg?.nodes[at]
    if (at === undefined || !to) return false
    Object.assign(w.flags, to.set)
    w.dialogue = { key, node: at, choice: 0, item, object }
    w.rev++
    // spend and hand over as the node opens; the box is already up, so a give's got box queues
    const spend = typeof to.take === 'string' ? { [to.take]: 1 } : (to.take ?? {})
    for (const [item, n] of Object.entries(spend)) takeItem(w, item as Item, n)
    if (to.give) gain(to.give)
    const crate = w.objects.find((o) => o.id === to.open)
    if (crate?.kind === 'crate' && !crate.open) {
      crate.open = true
      gain(crate.item)
      fire('crate:open')
    }
    startAct(w, w.dialogue, to, c)
    if (to.shake !== undefined) {
      const shakes = shakeTree(w, to.shake)
      if (shakes) {
        gain('twig') // the first twig's got box queues up behind the tree's own box
        fire(`tree:shake:${shakes}`)
      }
    }
    return true
  }
  // leaving the open node: follow `next`, or close and let the queue in. Shared by an interact on
  // a text node and by an act finishing on its own.
  const advance = (d: NonNullable<World['dialogue']>, node: DialogueNode | undefined) => {
    const chosen = choices(w, node, c.dialogues[d.key])[d.choice]
    if (chosen) Object.assign(w.flags, chosen.set)
    // a missing node is broken content: close rather than throw, a human fixes the json
    const next = node ? (chosen ? chosen.next : node.next) : null
    const to = (Array.isArray(next) ? pickBranch(w, next) : next) ?? null
    // a give's got box cuts in right after his line; the rest of the talk waits in `back`
    const got = w.queue.findIndex(
      (q) => q.key === 'got' && (node?.open || (node?.give && q.item === node.give)),
    )
    if (to !== null && got >= 0 && open('got', undefined, w.queue[got].item)) {
      w.queue.splice(got, 1)
      w.dialogue!.back = { key: d.key, node: to, item: d.item }
      return
    }
    if (to !== null && open(d.key, to, d.item, chosen?.object)) return
    if (d.back && open(d.back.key, d.back.node, d.back.item)) return
    w.dialogue = null
    w.typing = undefined
    w.closeup = null // a close-up only ever lasts the box it went up under
    w.rev++
    fire(`done:${d.key}`) // the box is shut: a scene waiting on this one can start now
    // whatever was already queued waits its turn again if that event opened a box ahead of it
    const queued = !w.dialogue && w.queue.shift()
    if (queued) open(queued.key, undefined, queued.item)
  }
  // a line the sim starts waits its turn rather than cutting off the box already on screen
  const play = (key: string, item?: Item) =>
    w.dialogue ? w.queue.push({ key, item }) : open(key, undefined, item)
  // every dialogue that asked for this event, whose `when` flag is set and `unless` flag is not,
  // and that has not played. The whole pass is picked before any flag is written, so one beat
  // cannot chain into the next.
  const fire = (e: string) => {
    if (w.area === 'cave') return
    const due = Object.entries(c.dialogues).filter(([key, dlg]) => {
      const t = dlg.trigger
      if (!t || t.event !== e || w.flags[`fired:${key}`]) return false
      return (!t.when || w.flags[t.when]) && (!t.unless || !w.flags[t.unless])
    })
    for (const [key] of due) {
      w.flags[`fired:${key}`] = true
      play(key)
    }
  }
  // true when this is the first of that item ever picked up
  const gain = (item: Item) => {
    cueInteract(w)
    w.inventory[item] = (w.inventory[item] ?? 0) + 1
    if (w.flags[`had:${item}`]) return false
    w.flags[`had:${item}`] = true
    // the orb tutorial talks to whatever the cursor starts on, so the orb keeps the first slot
    if (item === 'orb') w.inventory = { orb: w.inventory.orb, ...w.inventory }
    play('got', item) // the first of anything ever picked up gets a "you got X" box
    return true
  }

  // record the controller even in a dialogue or the menu, so a release is never missed
  if (a.type === 'move') {
    p.held = a.dir
    p.run = !!a.run
  }

  if (a.type === 'tick') {
    w.time += a.dt
    if (tickOrbs(w)) fire('salt:spawn')
    tickFlowers(w)
    tickMachines(w)
    tickCannons(w)
    if (tickFarewell(w)) fire('etarip:alongside')
    if (w.score < 0) fire('score:negative') // fires once, whenever beauty first reads below zero
    if (w.score >= 15) fire('score:fifteen') // and once, the first time it reads 15
    if (tickTrees(w)) fire('tree:near') // the promised tree, rested and back within three tiles
    tickCloseup(w)
    const live = w.pops.filter((pop) => w.time - pop.at < 1500) // a pop floats for 1500 ms
    if (live.length !== w.pops.length) {
      w.pops = live
      w.rev++
    }
    const ms = p.run ? 144 : 217 // ms per tile: 217 walking (4.6 tiles/s), 144 running
    // 50 ms turn delay: a tapped direction only turns, a held one walks
    if (!p.step && !busy && p.facing === p.held && w.time - p.turnedAt >= 50) startStep(0)
    if (p.step && !p.ride) {
      p.step.t += a.dt / ms // progress alone is not a visible change, so no rev
      if (p.step.t >= 1) {
        const leftover = (p.step.t - 1) * ms
        p.x = p.step.x
        p.y = p.step.y
        p.step = null
        p.parity = !p.parity
        w.rev++
        const mouth = objectAt(w, p.x, p.y) // stepping onto a cave mouth puts him down at the far end
        if (mouth?.kind === 'cave') {
          enterCave(w, mouth)
          if (mouth.to.area) return
        }
        const on = tileAt(w, p.x, p.y) // the north island is the only land this far up the map
        if (p.y <= 5 && (on === 'sand' || on === 'grass')) fire('arrive:north')
        if (p.x >= 32 && p.y < 28 && (on === 'sand' || on === 'grass')) fire('arrive:big')
        const west = (w.left ?? 0) < 0 && p.y >= 12 && p.y <= 21
        if (west && p.x <= 9) fire('west:four')
        if (p.held && !busy && (!w.dialogue || cur?.clear)) {
          if (p.facing !== p.held) {
            p.facing = p.held // already walking, so no turn delay
            w.rev++
          }
          startStep(leftover / ms) // keeps the speed constant across the boundary
        }
      }
    }
    tickWalks(w, a.dt)
    tickThrow(w)
    const act = w.dialogue
    const on = act ? c.dialogues[act.key]?.nodes[act.node] : undefined
    if (act && on && nodeDone(w, act, on)) advance(act, on)
    return
  }

  if (a.type === 'menu') {
    if (w.dialogue || p.step) return
    w.menu = w.menu ? null : { screen: 'inventory', cursor: 0 }
    cueInteract(w, true)
    if (!w.menu) fire('menu:close')
    return
  }

  if (a.type === 'talk') {
    if (!busy) open(a.key) // a scripted line waits for the box to be free; mid-step is fine
    return
  }

  const d = w.dialogue
  if (a.type === 'confirm') {
    if (d && cur && !nodeDone(w, d, cur, true)) return
    a = { type: 'interact' }
  }
  if (d && cur?.clear) {
    if (a.type !== 'move') return // asked out of the way: walking is all he can do until he is
  } else if (d) {
    const node = c.dialogues[d.key]?.nodes[d.node]
    if (node && node.text === undefined) return // an act runs to its end; input cannot skip it
    if (node && a.type === 'move') {
      const count = choices(w, node, c.dialogues[d.key]).length
      const by = a.dir === 'up' ? -1 : a.dir === 'down' ? 1 : 0
      const at = Math.max(0, Math.min(count - 1, d.choice + by))
      if (count > 0 && at !== d.choice) {
        d.choice = at
        cueInteract(w, true)
      }
      return
    }
    if (node && choices(w, node, c.dialogues[d.key]).length) cueInteract(w, true)
    advance(d, node)
    return
  }

  const m = w.menu
  if (m) {
    const slots = Object.entries(w.inventory).filter(([, n]) => n > 0)
    if (a.type === 'move' && a.dir) {
      const by = a.dir === 'left' ? -1 : a.dir === 'right' ? 1 : a.dir === 'up' ? -5 : 5 // 5 per row
      const at = Math.max(0, Math.min(slots.length - 1, m.cursor + by))
      if (at !== m.cursor) {
        m.cursor = at
        cueInteract(w, true)
      }
    }
    // interact uses the slot the cursor is on, on the tile in front of him
    const slot = a.type === 'interact' && slots[m.cursor]
    const did =
      slot && useItem(w, slot[0] as Item, p.x + DIRS[p.facing][0], p.y + DIRS[p.facing][1])
    if (!did) return
    w.menu = null // out of the bag, so he can see what he just did with it
    cueInteract(w, true)
    if (did !== 'used') fire(`salt:${did}`)
    return
  }

  if (a.type === 'move') {
    if (!p.step && a.dir && p.facing !== a.dir) {
      p.facing = a.dir
      p.turnedAt = w.time // walking waits 50 ms from here, so a tap only turns
      w.rev++
    }
    return
  }

  if (p.step) return // you only interact while standing
  const [x, y] = [p.x + DIRS[p.facing][0], p.y + DIRS[p.facing][1]]
  let obj = objectAt(w, x, y)
  // a bare bar is talked across: whoever stands on the far side of the counter is the one addressed
  if (obj?.kind === 'bar' && !obj.drink) {
    const past = objectAt(w, x + DIRS[p.facing][0], y + DIRS[p.facing][1])
    if (past?.kind === 'npc') obj = past
  }
  if (obj?.kind === 'npc') {
    cueInteract(w)
    fire(`talk:${obj.id}`) // a scene waiting on this npc cuts in ahead of their own lines
    if (!w.dialogue) open(obj.dialogue)
    obj.facing = OPP[p.facing] // the npc looks back at the player
    return
  }
  if (obj && ('dialogue' in obj || obj.kind === 'boat' || obj.kind === 'tree')) {
    cueInteract(w)
    if (obj.kind === 'tree' && obj.dialogue === 'bigtree' && !w.flags[`inspected:${obj.id}`]) {
      w.flags[`inspected:${obj.id}`] = true
      const count = (w.flags['bigtree:count'] = Number(w.flags['bigtree:count'] ?? 0) + 1)
      if (open('bigtree', `${count}`)) return
    }
    open(obj.dialogue ?? obj.kind)
    return
  }
  if (obj?.kind === 'crate') {
    if (obj.open) {
      if (obj.id === 'crate2' && w.flags['fired:mimic']) open('mimic', 'undercover')
      return
    }
    obj.open = true
    gain(obj.item)
    fire('crate:open') // fired after the got box, so Mich's line queues up behind it
    if (obj.id === 'crate4') fire('arrive:north') // salt beside the chest can bypass stepping ashore
    return
  }
  if (obj?.kind === 'chair' && !w.flags['harry:ok']) {
    cueInteract(w)
    open('handsoff') // harry is watching until he has had his cocktail
    return
  }
  if (obj?.kind === 'rum' || obj?.kind === 'chair') {
    w.objects.splice(w.objects.indexOf(obj), 1) // carried off whole, into the bag
    if (obj.kind === 'chair') beauty(w, -5, x, y) // the 5 it was worth stood at home goes with it
    gain(obj.kind)
    return
  }
  if (obj?.kind === 'bar') {
    if (!obj.drink) return // nothing on the counter and nobody behind it
    delete obj.drink
    gain('otijom')
    return
  }
  if (obj?.kind === 'gate') {
    if (!w.inventory.key) {
      cueInteract(w)
      open('gate') // it just says locked
      return
    }
    w.objects.splice(w.objects.indexOf(obj), 1) // unlocked, and out of the way for good
    takeItem(w, 'key', 1)
    return
  }
  if (obj?.kind === 'carrot') {
    if (!w.flags['shrimp:asked']) {
      cueInteract(w)
      open('carrotfield') // they are someone else's until antoine has asked for a hand
      return
    }
    w.objects.splice(w.objects.indexOf(obj), 1) // pulled up, leaving the tilled soil bare
    gain('carrot')
    return
  }
  if (obj?.kind === 'orb') {
    w.objects.splice(w.objects.indexOf(obj), 1) // boiling or finished, it always comes back to hand
    // picking the wreck's one up is the tutorial beat: `crate:open` is the event crate.json and the
    // flower scene still trigger on, from when it came out of a chest
    if (gain('orb')) fire('crate:open')
    return
  }
  if (obj) return
  // the sea in front of him: salt goes first, so the orb is never thrown out by accident
  const did = useItem(w, (w.inventory.salt ?? 0) > 0 ? 'salt' : 'orb', x, y)
  if (did && did !== 'used') fire(`salt:${did}`) // Mich's line is gated on score:on, by its own trigger
}
