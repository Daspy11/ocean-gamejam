import { walkPlayer } from './boat'
import { beauty } from './salt'
import { ITEMS, KINDS, type Dialogue, type DialogueNode, type Item, type World } from './world'

// The finale: a `throw` act sends the player off to fetch the first thing of some kind standing on
// the island and huck it at somebody. Only the golden egg does anything — it knocks Tarq off his
// carpet, and the carpet then wafts down and is worth 200 beauty wherever it settles.

const WAFT = 3000 // ms the carpet takes to come down out of the sky

function sources(w: World, kind: NonNullable<DialogueNode['throw']>['kind']) {
  const item = (kind === 'floor' ? 'carpet' : kind) as Item
  return [
    ...w.objects
      .filter((o) => o.kind === kind && !o.thrown)
      .map((o) => ({ id: o.id, item: undefined as Item | undefined })),
    ...Array.from({ length: ITEMS.includes(item) ? (w.inventory[item] ?? 0) : 0 }, (_, i) => ({
      id: `bag:${item}:${i}`,
      item,
    })),
  ]
}

// Resolve each physical copy once, so two chairs stay separate and used items disappear.
export function choices(w: World, node?: DialogueNode, dialogue?: Dialogue) {
  const used: Record<string, number> = {}
  return (node?.choices ?? []).flatMap((choice) => {
    const t = choice.next ? dialogue?.nodes[choice.next]?.throw : undefined
    if (!t) return [{ ...choice, object: undefined as string | undefined }]
    const index = used[t.kind] ?? 0
    used[t.kind] = index + 1
    const source = sources(w, t.kind)[index]
    return source ? [{ ...choice, object: source.id }] : []
  })
}

// the act opens: the way over to the thing, found once, like any scripted walk. Nothing of that
// kind on the island, or no way to it, and the act is over before it starts.
export function startThrow(w: World, t: NonNullable<DialogueNode['throw']>, id?: string): void {
  const it = sources(w, t.kind).find((o) => id === undefined || o.id === id)
  if (!it) return
  if (!it.item) walkPlayer(w, { id: 'player', near: it.id })
  w.throwing = { kind: t.kind, at: t.at, object: it.id }
  if (!w.player.step && !w.player.path?.length) w.throwing.launchAt = w.time + 300
}

export const throwDone = (w: World): boolean => w.throwing === null

// per tick: he walks the steps himself (no held key, so the box's hold on him does not apply),
// picks the thing up and throws it, and the egg alone knocks his target down.
export function tickThrow(w: World): void {
  const t = w.throwing
  const p = w.player
  if (!t || p.step || p.path?.length) return
  if (!t.flight) {
    const source = sources(w, t.kind).find((o) => o.id === t.object)
    const it = w.objects.find((o) => o.id === t.object)
    const him = w.objects.find((o) => o.id === t.at)
    if (!source || !him || (it && Math.abs(p.x - it.x) + Math.abs(p.y - it.y) > 1)) {
      w.throwing = null // it went somewhere between the act opening and him getting there
      return
    }
    t.launchAt ??= w.time + 300
    if (w.time < t.launchAt) return
    if (it) w.objects.splice(w.objects.indexOf(it), 1)
    else if (source.item) w.inventory[source.item]!--
    const riding =
      him.kind === 'npc' && w.objects.some((o) => o.id === him.ride && o.kind === 'flyingcarpet')
    const [x, y] = [p.x + 0.5, p.y + 0.25]
    const [dx, dy] = [him.x + 0.5 - x, him.y + (riding ? -1.75 : 0.25) - y]
    const distance = Math.hypot(dx, dy) || 1
    const speed = 20 // tiles per second
    const hitAt = w.time + (distance / speed) * 1000
    t.flight = {
      x,
      y,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      at: w.time,
      hitAt,
      until: Math.max(w.time + 2250, hitAt + 1400),
    }
    p.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    w.rev++
    return
  }
  if (!t.hit && w.time >= t.flight.hitAt) {
    t.hit = true
    const him = w.objects.find((o) => o.id === t.at)
    const rug = him?.kind === 'npc' ? w.objects.find((o) => o.id === him.ride) : undefined
    if (t.kind === 'egg' && him?.kind === 'npc' && rug?.kind === 'flyingcarpet') {
      const speed = Math.hypot(t.flight.vx, t.flight.vy) || 1
      const aim = { x: him.x + (t.flight.vx / speed) * 2, y: him.y + (t.flight.vy / speed) * 2 }
      // Leave room for his sideways sprite, not just an unoccupied centre tile.
      const landing = w.tiles
        .flatMap((tile, i) => {
          if (tile === 'water' || tile === 'rock') return []
          const [x, y] = [i % w.width, Math.floor(i / w.width)]
          if (Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1) return []
          const crowded = w.objects.some(
            (o) =>
              o !== him &&
              o.kind !== 'ball' &&
              o.kind !== 'embedded' &&
              x >= o.x - 1 &&
              x < o.x + KINDS[o.kind].w + 1 &&
              y >= o.y - 1 &&
              y < o.y + KINDS[o.kind].h + 1,
          )
          return crowded ? [] : [{ x, y }]
        })
        .sort(
          (a, b) =>
            (a.x - aim.x) ** 2 + (a.y - aim.y) ** 2 - ((b.x - aim.x) ** 2 + (b.y - aim.y) ** 2),
        )[0]
      delete him.ride
      him.flat = true
      him.thrown = { x: him.x, y: him.y, at: w.time }
      if (landing) [him.x, him.y] = [landing.x, landing.y]
      rug.landAt = w.time // and the act holds until the carpet is down too
      w.rev++
    }
  }
  if (w.time < t.flight.until) return
  const rug = w.objects.find((o) => o.kind === 'flyingcarpet')
  if (t.kind === 'egg' && rug?.kind === 'flyingcarpet' && rug.landAt !== undefined) {
    if (w.time < rug.landAt + WAFT) return
    // landAt stays: it is what tells the scene the carpet is down, with no shadow and no height
    beauty(w, 200, rug.x, rug.y) // a fashionable carpet, and the finest thing on the island
    w.rev++
  }
  w.throwing = null
}
