import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { mount, startWalk, tickWalks, walkPlayer } from './boat'
import { createWorld, npc, type Obj } from './world'

function party() {
  const w = createWorld()
  const mich = npc('mich', 'mich', 15, 17, 'right', 'mich') as Obj & { kind: 'npc' }
  const walter = npc('walter', 'walter', 15, 18, 'up', 'walter') as Obj & { kind: 'npc' }
  const rug: Obj = { id: 'rug', kind: 'flyingcarpet', x: 18, y: 17, landAt: -3000 }
  w.objects = [walter, mich, rug] // carriers need not precede their passengers
  Object.assign(w.player, { x: 17, y: 16 })
  return { w, mich, walter, rug }
}

describe('the ending party', () => {
  it('walks up to the carpet before boarding, including the player', () => {
    const { w, mich } = party()
    w.tiles.fill('grass')
    startWalk(w, { id: 'mich', near: 'rug' })
    walkPlayer(w, { id: 'player', near: 'rug' })
    expect(mich.step).toBeTruthy()
    expect(w.player.path?.length).toBeGreaterThan(0)
  })

  it('sets the landing tile as soon as a jump starts and carries the whole stack', () => {
    const { w, mich, walter, rug } = party()
    mount(w, { id: 'walter', on: 'mich' })
    expect([walter.x, walter.y]).toEqual([mich.x, mich.y])
    w.time = 400
    tickWalks(w, 400)
    mount(w, { id: 'mich', on: 'rug' })
    expect([mich.x, mich.y, walter.x, walter.y]).toEqual([rug.x, rug.y, rug.x, rug.y])
  })

  it('keeps the player and nested riders on the carpet through every tile boundary', () => {
    const { w, mich, walter, rug } = party()
    mich.ride = rug.id
    walter.ride = mich.id
    w.player.ride = rug.id
    delete rug.landAt
    startWalk(w, { id: 'rug', path: ['right', 'right', 'up'], run: true })
    for (let i = 0; i < 30; i++) {
      apply(w, { type: 'tick', dt: 16 }, { dialogues: {}, items: {} })
      for (const rider of [w.player, mich, walter]) {
        expect([rider.x, rider.y]).toEqual([rug.x, rug.y])
        expect(rider.step ?? null).toEqual(rug.step ?? null)
      }
    }
  })

  it('finishes boarding, then spends a full second lifting before travelling', () => {
    const { w, rug } = party()
    mount(w, { id: 'player', on: 'rug' }) // a 440 ms jump
    startWalk(w, { id: 'rug', path: ['right', 'right'], run: true })
    expect(rug.liftAt).toBe(440)
    w.time = 1440
    tickWalks(w, 1440)
    expect([rug.x, rug.step?.t, w.player.hop]).toEqual([18, 0, undefined])
    w.time += 250
    tickWalks(w, 250)
    expect([rug.x, rug.step, w.player.x]).toEqual([20, null, 20])
  })
})
