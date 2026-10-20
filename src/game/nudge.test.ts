import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, type Content, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['landing', 'orbhint', 'inventory1', 'seahint'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

// open a box and read it to the end, as the player would
function talk(w: World, key?: string) {
  if (key) apply(w, { type: 'talk', key }, content)
  for (let i = 0; i < 20 && w.dialogue; i++) {
    apply(w, { type: 'tick', dt: 1000 }, content)
    apply(w, { type: 'interact' }, content)
  }
}

const wait = (w: World, ms: number) => apply(w, { type: 'tick', dt: ms }, content)

describe('Mich nudges a player who has not moved on', () => {
  it('tells him how to pick things up 20 s after the landing, if the orb is still lying there', () => {
    const w = createWorld()
    talk(w, 'landing')
    expect(w.dialogue).toBeNull()
    wait(w, 19000)
    expect(w.dialogue).toBeNull()
    wait(w, 1000)
    expect(w.dialogue?.key).toBe('orbhint')
    expect(w.typing?.text).toBe('you know how to pick up things, right?')
    talk(w)
    wait(w, 60000)
    expect(w.dialogue).toBeNull() // once only

    const picked = createWorld()
    talk(picked, 'landing')
    picked.flags['had:orb'] = true
    wait(picked, 20000)
    expect(picked.dialogue).toBeNull()
  })

  it('tells him how to throw it 20 s after she says to, if he has not', () => {
    const w = createWorld()
    talk(w, 'inventory1')
    wait(w, 20000)
    expect(w.dialogue?.key).toBe('seahint')
    expect(w.typing?.text).toBe('if i were you, i would try walking up to the water and pressing E')

    const thrown = createWorld()
    talk(thrown, 'inventory1')
    thrown.flags['used:orb'] = true
    wait(thrown, 20000)
    expect(thrown.dialogue).toBeNull()
  })
})
