import { stepObj, tickWalks } from './boat'
import { putBy, tickMachines } from './machine'
import { shakeTree, startTree, tickTrees, treeDone } from './tree'
import { makeSalt, useItem } from './salt'
import { DIRS, KINDS, objectAt, tileAt } from './world'
import type { Action, Branch, Content, DialogueNode, Item, World } from './world'

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' } as const

// is the open node's act over? Its dialogue then moves on by itself, with no interact
function actDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
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
  if (node.gone !== undefined) return !w.objects.some((o) => o.id === node.gone)
  if (node.fly !== undefined || node.land !== undefined) return treeDone(w, node)
  if (node.wait !== undefined) return w.time >= (d.until ?? 0)
  if (node.rumble !== undefined) return w.time >= w.rumble
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
    const ground = tile === 'salt' || tile === 'sand' || tile === 'grass' || tile === 'farm'
    if (!ground || (obj && KINDS[obj.kind].solid)) return
    p.step = { x, y, t }
    w.rev++
  }
  // both `start` and a branching `next` are read this way: first entry whose `when` flag is truthy
  // and whose `has` items are all in the bag. Nothing matching means there is nowhere to go.
  const pick = (list: Branch[] | undefined) =>
    list?.find(
      (s) =>
        (!s.when || !!w.flags[s.when]) &&
        Object.entries(s.has ?? {}).every(([item, n]) => (w.inventory[item as Item] ?? 0) >= n),
    )?.node
  // opens key at node, or at the start the flags pick; `item` fills {item} in the text
  const open = (key: string, node?: string, item?: Item) => {
    const dlg = c.dialogues[key]
    const at = node ?? pick(dlg?.start)
    const to = at === undefined ? undefined : dlg?.nodes[at]
    if (at === undefined || !to) return false
    Object.assign(w.flags, to.set)
    w.dialogue = { key, node: at, choice: 0, item }
    w.rev++
    // spend and hand over as the node opens; the box is already up, so a give's got box queues
    const spend = typeof to.take === 'string' ? { [to.take]: 1 } : (to.take ?? {})
    for (const [item, n] of Object.entries(spend)) take(item as Item, n)
    if (to.give) gain(to.give)
    const walk = to.walk
    if (walk) {
      const o = w.objects.find((x) => x.id === walk.id) // a missing one just ends the act at once
      if (o) {
        if (o.kind === 'npc') delete o.ride // a walk of his own gets him off whatever he was riding
        o.path = [...walk.path]
        o.run = walk.run
        stepObj(w, o, 0)
      }
    }
    if (to.wait !== undefined) w.dialogue.until = w.time + to.wait
    if (to.rumble !== undefined) w.rumble = w.time + to.rumble
    const spawn = to.spawn
    if (spawn && !w.objects.some((o) => o.id === spawn.id)) w.objects.push(structuredClone(spawn))
    if (to.put) putBy(w, to.put)
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
  // a node's `take` spends them: the key goes when the last is gone, so the inventory drops the slot
  const take = (item: Item, n: number) => {
    const left = (w.inventory[item] ?? 0) - n
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
        makeSalt(w, o.x, o.y) // the orb stays put, now sitting on the crust it boiled
        fire('salt:spawn')
      }
    for (const o of w.objects)
      if (
        o.kind === 'flower' &&
        o.bloomAt !== undefined &&
        !o.white &&
        w.time >= o.bloomAt + 1500
      ) {
        o.white = true // every flower that blooms on the main island is worth the same 10 beauty
        if (w.main[o.y * w.width + o.x]) {
          w.score += 10
          w.pops.push({ x: o.x, y: o.y, text: '+10', at: w.time })
        }
        w.rev++
      }
    tickMachines(w)
    if (w.score < 0) fire('score:negative') // fires once, whenever beauty first reads below zero
    if (w.score >= 15) fire('score:fifteen') // and once, the first time it reads 15
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
        const mouth = objectAt(w, p.x, p.y) // stepping onto a cave mouth puts him down at the far end
        if (mouth?.kind === 'cave') {
          p.x = mouth.to.x
          p.y = mouth.to.y
          w.rev++
        }
        const on = tileAt(w, p.x, p.y) // the north island is the only land this far up the map
        if (p.y <= 5 && (on === 'sand' || on === 'grass')) fire('arrive:north')
        if (p.held && !busy) {
          if (p.facing !== p.held) {
            p.facing = p.held // already walking, so no turn delay
            w.rev++
          }
          startStep(leftover / ms) // keeps the speed constant across the boundary
        }
      }
    }
    tickWalks(w, a.dt)
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
    const slots = Object.entries(w.inventory).filter(([, n]) => n > 0)
    if (a.type === 'move' && a.dir) {
      const by = a.dir === 'left' ? -1 : a.dir === 'right' ? 1 : a.dir === 'up' ? -5 : 5 // 5 per row
      const at = Math.max(0, Math.min(slots.length - 1, m.cursor + by))
      if (at !== m.cursor) {
        m.cursor = at
        w.rev++
      }
    }
    // interact uses the slot the cursor is on, on the tile in front of him
    const slot = a.type === 'interact' && slots[m.cursor]
    const did =
      slot && useItem(w, slot[0] as Item, p.x + DIRS[p.facing][0], p.y + DIRS[p.facing][1])
    if (!did) return
    w.menu = null // out of the bag, so he can see what he just did with it
    w.rev++
    if (did !== 'used') fire(`salt:${did}`)
    return
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
  if (obj?.kind === 'rack') {
    w.objects.splice(w.objects.indexOf(obj), 1) // hats and all: the whole rack goes in the bag
    gain('hatrack')
    return
  }
  if (obj?.kind === 'carrot') {
    if (!w.flags['shrimp:asked']) {
      open('carrotfield') // they are someone else's until antoine has asked for a hand
      return
    }
    w.objects.splice(w.objects.indexOf(obj), 1) // pulled up, leaving the tilled soil bare
    gain('carrot')
    if (!w.objects.some((o) => o.kind === 'carrot')) fire('carrots:done') // the field is picked
    return
  }
  if (obj?.kind === 'orb') {
    w.objects.splice(w.objects.indexOf(obj), 1) // boiling or finished, it always comes back to hand
    gain('orb')
    return
  }
  if (obj) return
  // the sea in front of him: salt goes first, so the orb is never thrown out by accident
  const did = useItem(w, (w.inventory.salt ?? 0) > 0 ? 'salt' : 'orb', x, y)
  if (did && did !== 'used') fire(`salt:${did}`) // Mich's line is gated on score:on, by its own trigger
}
