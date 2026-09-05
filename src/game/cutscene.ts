import type { World } from './world'

// The debug menu warping out from under a cutscene: drop the script rather than leave it playing in
// a place the player has just left. Everyone mid-walk stops where they stand.
export function cancelScene(w: World): void {
  w.dialogue = null
  w.queue = []
  w.rumble = 0
  for (const o of w.objects) {
    o.step = null
    o.path = []
  }
  w.rev++
}
