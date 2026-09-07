import { walkPlayer } from './boat'
import { beauty } from './salt'
import type { DialogueNode, World } from './world'

// The finale: a `throw` act sends the player off to fetch the first thing of some kind standing on
// the island and huck it at somebody. Only the golden egg does anything — it knocks Tarq off his
// carpet, and the carpet then wafts down and is worth 200 beauty wherever it settles.

const FLIGHT = 300 // ms in the air, the same arc a thrown orb makes
const WAFT = 3000 // ms the carpet takes to come down out of the sky

// the act opens: the way over to the thing, found once, like any scripted walk. Nothing of that
// kind on the island, or no way to it, and the act is over before it starts.
export function startThrow(w: World, t: NonNullable<DialogueNode['throw']>): void {
  const it = w.objects.find((o) => o.kind === t.kind)
  if (!it) return // nothing of that kind on the island: the act is over before it starts
  walkPlayer(w, { id: 'player', near: it.id })
  w.throwing = { kind: t.kind, at: t.at }
}

export const throwDone = (w: World): boolean => w.throwing === null

// per tick: he walks the steps himself (no held key, so the box's hold on him does not apply),
// picks the thing up and throws it, and the egg alone knocks his target down.
export function tickThrow(w: World): void {
  const t = w.throwing
  const p = w.player
  if (!t || p.step || p.path?.length) return
  if (t.flew === undefined) {
    const it = w.objects.find((o) => o.kind === t.kind)
    const him = w.objects.find((o) => o.id === t.at)
    if (!it || !him) {
      w.throwing = null // it went somewhere between the act opening and him getting there
      return
    }
    // picked up and hucked: it flies from his tile to whoever it is aimed at, and he watches it go
    it.thrown = { x: p.x, y: p.y, at: w.time }
    it.x = him.x
    it.y = him.y
    const [dx, dy] = [him.x - p.x, him.y - p.y]
    p.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    t.flew = w.time
    w.rev++
    return
  }
  if (w.time < t.flew + FLIGHT) return
  const flying = w.objects.find((o) => o.kind === t.kind && o.thrown)
  if (flying) {
    w.objects.splice(w.objects.indexOf(flying), 1) // thrown is thrown: it is not picked back up
    w.rev++
    const him = w.objects.find((o) => o.id === t.at)
    const rug = him?.kind === 'npc' ? w.objects.find((o) => o.id === him.ride) : undefined
    if (t.kind !== 'egg' || him?.kind !== 'npc' || rug?.kind !== 'flyingcarpet') {
      w.throwing = null // anything else just bounces off him
      return
    }
    delete him.ride // two tiles to his left, off the carpet, the way a wreck throws its crew out
    him.flat = true
    him.thrown = { x: him.x, y: him.y, at: w.time }
    him.x -= 2
    rug.landAt = w.time // and the act holds until the carpet is down too
    return
  }
  const rug = w.objects.find((o) => o.kind === 'flyingcarpet')
  if (rug?.kind === 'flyingcarpet' && rug.landAt !== undefined) {
    if (w.time < rug.landAt + WAFT) return
    // landAt stays: it is what tells the scene the carpet is down, with no shadow and no height
    beauty(w, 200, rug.x, rug.y) // a fashionable carpet, and the finest thing on the island
    w.rev++
  }
  w.throwing = null
}
