import { enterCave } from './map'
import { PRIZES } from './salt'
import { objectAt, startStep, tileAt, tileIndex } from './world'
import type { World } from './world'

// The player's grid walk, RPG Maker style: a step is the tile ahead plus progress 0..1, and a held
// key runs straight into the next one at the boundary.

// startStep has just taken a step: Walter takes it back if it carries a prize off the main island,
// since players were collecting loot and walking away with it. He is only about once his own scene
// has run (score:on), and a chair is left out of it because the shrimp is owed one.
function walterStops(w: World, play: (key: string) => void): void {
  const p = w.player
  if (!p.step || w.dialogue || !w.flags['score:on']) return
  if (!PRIZES.some((item) => (w.inventory[item] ?? 0) > 0)) return
  if (!w.main[tileIndex(w, p.x, p.y)] || w.main[tileIndex(w, p.step.x, p.step.y)]) return
  // he stops dead facing the way out and has to let the key go, or the line reopens as he closes it
  p.step = null
  p.held = null
  play('notsofast')
}

// dt ms of walking, when `free` (no box or bag holding him); `fire` gets the events of the tile he
// arrives on, `play` the lines he walks into. False when a cave mouth has moved him to another
// area, and the tick is over.
export function tickStep(
  w: World,
  dt: number,
  free: boolean,
  fire: (e: string) => void,
  play: (key: string) => void,
): boolean {
  const p = w.player
  const ms = p.run ? 144 : 217 // ms per tile: 217 walking (4.6 tiles/s), 144 running
  // 50 ms turn delay: a tapped direction only turns, a held one walks
  if (!p.step && free && p.facing === p.held && w.time - p.turnedAt >= 50) {
    startStep(w, 0)
    walterStops(w, play)
  }
  if (!p.step || p.ride) return true
  p.step.t += dt / ms // progress alone is not a visible change, so no rev
  if (p.step.t < 1) return true
  const leftover = (p.step.t - 1) * ms
  const away = !w.main[tileIndex(w, p.x, p.y)] // where he set out from, for the homecoming below
  p.x = p.step.x
  p.y = p.step.y
  p.step = null
  p.parity = !p.parity
  w.rev++
  const mouth = objectAt(w, p.x, p.y) // stepping onto a cave mouth puts him down at the far end
  if (mouth?.kind === 'cave') {
    enterCave(w, mouth)
    if (mouth.to.area) return false
  }
  const box = w.dialogue // a line the tile opens stops him; one already up has let him walk
  const on = tileAt(w, p.x, p.y) // the north island is the only land this far up the map
  if (p.y <= 5 && (on === 'sand' || on === 'grass')) fire('arrive:north')
  if (p.x >= 32 && p.y < 28 && (on === 'sand' || on === 'grass')) fire('arrive:big')
  // home with loot still in the bag: Walter smells it and says what it is for
  if (away && w.main[tileIndex(w, p.x, p.y)] && PRIZES.some((i) => (w.inventory[i] ?? 0) > 0))
    fire('haul')
  const west = (w.left ?? 0) < 0 && p.y >= 12 && p.y <= 21
  if (west && p.x <= 9) fire('west:four')
  if (p.held && free && w.dialogue === box) {
    if (p.facing !== p.held) {
      p.facing = p.held // already walking, so no turn delay
      w.rev++
    }
    startStep(w, leftover / ms) // keeps the speed constant across the boundary
    walterStops(w, play)
  }
  return true
}
