import type Phaser from 'phaser'
import { expect, it, vi } from 'vitest'
import { createWorld } from '../game/world'
import { load } from '../store'
import { drawActor } from './crash'

it('draws Walter facing his listener when stationary and scuttling sideways while moving', () => {
  const w = createWorld()
  load(w)
  const sprite = {
    setPosition: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setFrame: vi.fn().mockReturnThis(),
  }
  const actor = { ...w.player, x: 20, y: 20, facing: 'up' as const }
  drawActor(sprite as unknown as Phaser.GameObjects.Sprite, actor, 'walter')
  expect(sprite.setFrame).toHaveBeenLastCalledWith(13)
  drawActor(
    sprite as unknown as Phaser.GameObjects.Sprite,
    {
      ...actor,
      step: { x: 20, y: 19, t: 0.6 },
    },
    'walter',
  )
  expect(sprite.setFrame).toHaveBeenLastCalledWith(11)
  drawActor(sprite as unknown as Phaser.GameObjects.Sprite, actor, 'etarp')
  expect(sprite.setFrame).toHaveBeenLastCalledWith(1)
})
