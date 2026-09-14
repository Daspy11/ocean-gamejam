import { mount, rideDone, sitDone, startSpin, startWalk, walkPlayer } from './boat'
import { fireDone, startFire } from './cannon'
import { armMachine, putBy } from './machine'
import { startThrow, throwDone } from './throw'
import { startTree, treeDone } from './tree'
import { cueInteract, inside } from './world'
import { revealed } from './script'
import type { Branch, Content, DialogueNode, Item, Obj, World } from './world'

// Cutscene acts: a dialogue node without text. One starts as its node opens, and the node moves on
// by itself once it is over. The shake act stays in actions.ts, since it hands out a twig.

export function startAct(
  w: World,
  d: NonNullable<World['dialogue']>,
  to: DialogueNode,
  content: Content,
): void {
  const pause = to.walk?.id === 'etarp' && !!w.typing
  const item = d.item
  const name = item
    ? `${w.flags[`name:${item}`] ?? content.items[item]?.name ?? `[PLACEHOLDER ${item}]`}`
    : ''
  const who =
    to.who === '' ? 'You' : to.who === null ? '' : (to.who ?? content.dialogues[d.key]?.name ?? '')
  w.typing =
    to.text === undefined
      ? undefined
      : {
          text: (item ? to.text.replaceAll('{item}', name) : to.text)
            .replaceAll('{score}', `${w.score}`)
            .replace(/\bpress i\b/gi, `press ${w.controls?.inventory ?? 'I'}`)
            .replace(/\bpress e\b/gi, `press ${w.controls?.confirm ?? 'E'}`),
          at: w.time,
          who,
        }
  // An explicit empty who is the player; null or an unnamed dialogue is narration.
  if (w.typing && !who) w.typing.done = true
  if (to.text !== undefined && who && d.key !== 'etarip-farewell') {
    const ids: Record<string, string> = {
      you: 'player',
      etarip: 'etarp',
      'dr. sceantist': 'seahorse',
      "golfer's delight": 'albatross',
      'antoine le shrimp': 'shrimp',
      'suspicious harry': 'harry',
      chest: 'crate2',
      tree: 'tree1',
      'tree 2': 'tree2',
    }
    const cast = new Map<string, World['player'] | Obj>([
      ['player', w.player],
      ...w.objects.map((o) => [o.id, o] as const),
    ])
    const speaker = d.key === 'tree2' ? 'tree2' : (ids[who.toLowerCase()] ?? who.toLowerCase())
    const owner = content.dialogues[d.key]?.name.toLowerCase() ?? ''
    let listener = speaker === 'player' ? (ids[owner] ?? owner) : 'player'
    // Group scenes address each other, rather than always addressing the player.
    if (d.key === 'pirate' && speaker === 'mich') listener = 'etarp'
    if (d.key === 'pirate' && ['20', '21', '24', '29', '36'].includes(d.node)) listener = 'mich'
    if (
      d.key === 'flower' &&
      [
        '18',
        '19',
        '20',
        '20c',
        'wow',
        '21',
        '22',
        'yes',
        '22b',
        '23',
        '24',
        '25',
        '26',
        '29',
        'carpet3',
        'noTree',
        'noTree2',
      ].includes(d.node)
    )
      listener = speaker === 'mich' ? 'walter' : 'mich'
    if (d.key === 'flower' && ['30', '31', '32'].includes(d.node))
      listener = speaker === 'player' ? 'walter' : 'player'
    if (['flower', 'tree', 'treealive'].includes(d.key) && d.node.startsWith('sun'))
      listener = speaker === 'mich' ? 'walter' : 'mich'
    if (d.key === 'seahorse' && d.node !== 'again')
      listener = speaker === 'seahorse' ? 'mich' : 'seahorse'
    if (d.key === 'cannon' || (d.key === 'tarq' && ['yarr', 'sea0'].includes(d.node))) {
      if (speaker === 'etarp') listener = 'seahorse'
      if (speaker === 'seahorse') listener = 'etarp'
    }
    if (d.key === 'tarq') {
      if (Number(d.node) <= 21 || ['ow', 'out2', 'out3', 'out5', 'out8'].includes(d.node))
        listener = speaker === 'tarq' ? 'mich' : 'tarq'
      if (d.node === 'bye2') listener = 'walter'
    }
    if (d.key === 'treefriend' && ['4', '5'].includes(d.node))
      listener = speaker === 'tree1' ? 'tree2' : 'tree1'
    // Keep deliberate looks at props while discussing them.
    if (d.key === 'flower' && ['8', '12', '13', '14'].includes(d.node)) listener = 'flower1'
    if (d.key === 'pirate' && ['33', '43'].includes(d.node)) listener = 'ship'
    if (d.key === 'tarq' && ['crab2', 'crab3'].includes(d.node)) listener = 'flyingcarpet1'
    const audience = new Set(['player', speaker, listener])
    if (['flower', 'pirate', 'seahorse', 'cannon', 'tarq'].includes(d.key)) {
      audience.add('mich')
      if (['flower', 'seahorse', 'cannon', 'tarq'].includes(d.key)) audience.add('walter')
    }
    for (const id of audience) {
      const actor = cast.get(id)
      const target = cast.get(id === speaker ? listener : speaker)
      if (!actor || !target || !('facing' in actor)) continue
      if ('flat' in actor && actor.flat) continue
      if (actor.path?.length || (actor.step && !('wander' in actor && actor.wander))) continue
      if (d.key === 'landing' && d.node === '4' && id === 'mich') continue
      const [dx, dy] = [target.x - actor.x, target.y - actor.y]
      if (!dx && !dy) continue // passengers sharing a tile keep their deck poses
      actor.facing =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      delete actor.face
      w.rev++
    }
  }
  // The pirate's step off now happens at impact, before his first line.
  if (to.walk && !pause && !(d.key === 'pirate' && d.node === '7'))
    (to.walk.id === 'player' ? walkPlayer : startWalk)(w, to.walk)
  if (pause) d.until = w.time + 300 // let the closed dialogue settle before he moves
  if (to.wait !== undefined) d.until = w.time + to.wait
  const seated = w.objects.find((o) => o.id === to.sit)
  if (seated?.kind === 'harry') seated.satAt = w.time
  if (to.after !== undefined) d.until = w.time + to.after
  if (to.rumble !== undefined)
    // Give the pirate's entrance music a lead-in before his ship appears.
    w.rumble = w.time + (d.key === 'pirate' && d.node === '1' ? 2000 : to.rumble)
  if (d.key === 'pirate' && d.node === '5') {
    const pirate = w.objects.find((o) => o.id === 'etarp')
    if (pirate?.kind === 'npc' && pirate.ride === 'ship') {
      pirate.thrown = { x: pirate.x + 0.5, y: pirate.y - 1 / 16, at: w.time }
      startWalk(w, { id: pirate.id, path: ['left'] })
    }
    d.until = w.time + 900 // the 600 ms somersault, then 300 ms on his feet before he speaks
  }
  const spawn = to.spawn
  if (d.key === 'flower' && spawn?.kind === 'flower') {
    d.until = w.time + 300
    const mich = w.objects.find((o) => o.id === 'mich')
    if (mich?.kind === 'npc') mich.facing = 'up' // turn back to planting after calling the player over
  }
  if (spawn && !w.objects.some((o) => o.id === spawn.id)) {
    const obj = structuredClone(spawn)
    if (to.spawnRelative === 'player') {
      obj.x += w.player.x
      obj.y += w.player.y
    }
    w.objects.push(obj)
    if (
      [
        'bar',
        'flower',
        'floor',
        'chair',
        'crate',
        'cannon',
        'machine',
        'orb',
        'egg',
        'certificate',
      ].includes(spawn.kind)
    )
      cueInteract(w)
  }
  if (to.put && putBy(w, to.put)) cueInteract(w)
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
  if (to.take === 'glassi' || (typeof to.take === 'object' && to.take.glassi)) {
    w.closeup = {
      sheet: 'etarp',
      frame: 1,
      frames: 1,
      at: w.time,
      since: w.time,
      burst: null,
      auto: true,
    }
    w.rev++
  }
  if (to.spin !== undefined && !w.closeup?.auto) startSpin(w, to.spin)
  const turn = to.face && w.objects.find((o) => o.id === to.face?.id)
  if (turn?.kind === 'npc') {
    turn.facing = to.face!.dir
    w.rev++
  }
  if (to.throw) startThrow(w, to.throw, d.object)
  if (to.ride) mount(w, to.ride)
  const bar = w.objects.find((o) => o.id === to.drink) // no such bar: no drink, and that is all
  if (bar?.kind === 'bar' && !bar.drink) {
    cueInteract(w)
    bar.drink = true
    w.rev++
  }
  const f = w.objects.find((o) => o.id === to.bloom) // a missing flower just ends the act at once
  if (f?.kind === 'flower') f.bloomAt = w.time
  if (to.fly !== undefined || to.land !== undefined) startTree(w, to)
}

// does the open node move on by itself, with no interact? A text node only with an `after` time up
export function nodeDone(
  w: World,
  d: NonNullable<World['dialogue']>,
  node: DialogueNode,
  confirm = false,
): boolean {
  if (w.closeup?.auto) return false
  if (confirm) {
    if (node.text === undefined) return false
    const t = w.typing
    if (t && !t.done && revealed(t.text, w.time - t.at) < t.text.length) {
      t.done = true
      w.rev++
      return false
    }
    return true
  }
  if (node.text !== undefined) return node.after !== undefined && w.time >= (d.until ?? 0)
  return actDone(w, d, node)
}

// is the open node's act over? Its dialogue then moves on by itself, with no interact
function actDone(w: World, d: NonNullable<World['dialogue']>, node: DialogueNode): boolean {
  if (w.time < (d.until ?? 0)) return false
  const walk = node.walk
  if (walk) {
    if (walk.id === 'etarp' && d.until !== undefined) {
      delete d.until
      if (!(d.key === 'pirate' && d.node === '7')) startWalk(w, walk)
    }
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
  // a sit node's wait holds on past its time until his feet are down and the chairs are all free
  if (node.wait !== undefined) return w.time >= (d.until ?? 0) && sitDone(w, node.sit)
  if (node.rumble !== undefined) return w.time >= Math.max(w.rumble, d.until ?? 0)
  return true // a spawn lands the moment the node opens, and a node with no act at all is over too
}

// a burst close-up taken down is gone once the camera has had its second to ease back out
export function tickCloseup(w: World): void {
  const c = w.closeup
  if (c?.auto) {
    if (c.burst === null && w.time >= c.at + 1000) {
      c.burst = c.at + 1000
      w.rev++
    }
    if (c.down === undefined && w.time >= c.at + 3000) {
      c.down = c.at + 3000
      w.rev++
    }
  }
  const down = w.closeup?.down
  if (down !== undefined && w.time >= down + 1000) {
    if (c?.auto && w.typing) w.typing.at = w.time
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
