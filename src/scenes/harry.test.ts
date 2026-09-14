import type Phaser from 'phaser'
import { expect, it } from 'vitest'
import { apply } from '../game/actions'
import { createWorld } from '../game/world'
import { load, world } from '../store'
import { inTheAir } from './crash'

it('plays Harry lowering his feet once and keeps him seated after a chair is taken', () => {
  const w = createWorld()
  const harry = w.objects.find((o) => o.kind === 'harry')!
  if (harry.kind !== 'harry') throw new Error('missing Harry')
  harry.satAt = 100
  load(w)
  const drawn = {
    originY: 1,
    frame: 0,
    setFrame(frame: number) {
      this.frame = frame
      return this
    },
  }
  for (const [time, frame] of [
    [100, 0],
    [299, 0],
    [300, 1],
    [499, 1],
    [500, 2],
    [699, 2],
    [700, 3],
  ]) {
    w.time = time
    apply(w, { type: 'tick', dt: 0 }, { dialogues: {}, items: {} })
    inTheAir(drawn as unknown as Phaser.GameObjects.Sprite, harry)
    expect(drawn.frame).toBe(frame)
    expect(w.objects.filter((o) => o.kind === 'chair' && o.hidden)).toHaveLength(3 - frame)
  }
  w.objects = w.objects.filter((o) => o.id !== 'chair1')
  w.time = 3000
  load(JSON.parse(JSON.stringify(w)))
  inTheAir(
    drawn as unknown as Phaser.GameObjects.Sprite,
    world.objects.find((o) => o.kind === 'harry')!,
  )
  expect(drawn.frame).toBe(3)
})
