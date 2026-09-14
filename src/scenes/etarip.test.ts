import { readFileSync } from 'node:fs'
import type Phaser from 'phaser'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../game/actions'
import { createWorld, npc, tileAt, type Content } from '../game/world'
import { load, world } from '../store'
import Debug from './Debug'
import { flyOut } from './leave'

vi.mock('phaser', () => ({ default: { Scene: vi.fn() } }))

function sprite(x = 0, y = 0) {
  return {
    x,
    y,
    visible: true,
    frame: 0,
    depth: 0,
    setPosition(x: number, y: number) {
      this.x = x
      this.y = y
      return this
    },
    setFrame(frame: number) {
      this.frame = frame
      return this
    },
    setVisible(visible: boolean) {
      this.visible = visible
      return this
    },
    setOrigin() {
      return this
    },
    setDepth(depth: number) {
      this.depth = depth
      return this
    },
    setAlpha() {
      return this
    },
    setScale() {
      return this
    },
    setText() {
      return this
    },
  }
}

describe('Etarip on the way out', () => {
  it.each([false, true])(
    'paces the carpet and waits for the farewell before showing hearts, reconciled: %s',
    (peace) => {
      const c: Content = {
        dialogues: {
          'etarip-farewell': JSON.parse(
            readFileSync(
              new URL('../../assets/dialogue/etarip-farewell.json', import.meta.url),
              'utf8',
            ),
          ),
        },
        items: {},
      }
      const w = createWorld()
      w.objects = [
        { id: 'rug', kind: 'flyingcarpet', x: 32, y: 17 },
        Object.assign(npc('mich', 'mich', 32, 17, 'right', ''), { ride: 'rug' }),
      ]
      w.player.ride = 'rug'
      Object.assign(w.flags, { outro: true, 'etarp:i': true, 'etarp:peace': peace })
      load(w)
      const deck = sprite(512, 264)
      const mich = sprite(503, 254)
      const player = sprite(521, 254)
      const pictures: { key: string; s: ReturnType<typeof sprite> }[] = []
      const sea = sprite()
      const camera = {
        midPoint: { x: 520, y: 258 },
        stopFollow() {},
        removeBounds() {},
        setZoom() {
          return this
        },
        centerOn(x: number, y: number) {
          this.midPoint = { x, y }
          return this
        },
      }
      const scene = {
        sound: { add: () => ({ play: vi.fn(), destroy: vi.fn() }) },
        cameras: { main: camera },
        scene: { launch: vi.fn() },
        add: {
          tileSprite: () => sea,
          image: (x: number, y: number, key: string) => {
            const s = sprite(x, y)
            pictures.push({ key, s })
            return s
          },
        },
        tweens: { add: vi.fn() },
        events: { on: vi.fn(), once: vi.fn() },
      }
      flyOut(
        scene as unknown as Phaser.Scene,
        () => [deck, mich] as unknown as Phaser.GameObjects.Sprite[],
        player as unknown as Phaser.GameObjects.Sprite,
        sprite() as unknown as Phaser.GameObjects.Sprite,
      )
      const tick = scene.events.on.mock.calls[0][1] as (now: number, dt: number) => void
      const frame = (dt: number) => {
        apply(w, { type: 'tick', dt }, c)
        deck.setPosition(512, 264)
        mich.setPosition(503, 254)
        player.setPosition(521, 254)
        tick(w.time, dt)
      }
      const boat = pictures.find((p) => p.key === (peace ? 'sprites/seahorse' : 'sprites/boat'))!.s
      const etarp = pictures.find((p) => p.key === 'sprites/etarp')!.s
      expect(pictures.some((p) => p.key === (peace ? 'sprites/boat' : 'sprites/seahorse'))).toBe(
        false,
      )
      const arrivals: number[] = []
      for (let i = 0; i < 500; i++) {
        frame(100)
        if (w.farewell?.phase === 'approach') arrivals.push(boat.x - deck.x)
        if (w.farewell?.phase === 'alongside') expect(boat.x - deck.x).toBeCloseTo(-48)
        expect(player.frame).toBe(w.farewell?.phase === 'alongside' ? 5 : 9)
        if (w.farewell?.phase === 'alongside') expect(mich.frame).toBe(5)
        expect(etarp.visible).toBe(boat.visible)
        expect([etarp.x - boat.x, etarp.y - boat.y]).toEqual(peace ? [1, -15] : [8, -5])
        expect(etarp.depth > boat.depth).toBe(peace)
        expect(pictures.some((p) => p.key === 'sprites/heart')).toBe(false)
      }
      expect(arrivals[1] - arrivals[0]).toBeGreaterThan(arrivals.at(-1)! - arrivals.at(-2)!)
      expect(w.dialogue?.node).toBe(peace ? 'science' : '1')
      expect(boat.visible).toBe(true)
      expect(sea.x).toBeLessThan(camera.midPoint.x - 120)
      expect(scene.scene.launch).not.toHaveBeenCalled()
      apply(w, { type: 'interact' }, c)
      apply(w, { type: 'interact' }, c)
      frame(0)
      const departure: number[] = []
      for (let i = 0; i < 16; i++) {
        frame(100)
        if (boat.visible) departure.push(boat.x - deck.x)
      }
      expect(departure.at(-1)! - departure.at(-2)!).toBeGreaterThan(departure[1] - departure[0])
      expect(boat.visible).toBe(false)
      expect(w.dialogue?.node).toBe('mich')
      apply(w, { type: 'interact' }, c)
      expect(w.dialogue?.node).toBe('player')
      frame(0)
      expect(player.frame).toBe(5)
      expect(mich.frame).toBe(9)
      apply(w, { type: 'interact' }, c)
      for (let i = 0; i < 200; i++) frame(100)
      expect(pictures.filter((p) => p.key === 'sprites/heart')).toHaveLength(2)
      expect(scene.scene.launch).toHaveBeenCalledWith('outro')
      expect(player.frame).toBe(9)
    },
  )

  it('provides working debug jumps for the island, gift, and ending inside the screen', () => {
    vi.stubGlobal('location', { search: '' })
    const debug = new Debug()
    const panel = vi.fn(() => sprite())
    const launch = vi.fn()
    Object.assign(debug, {
      scene: { manager: { getScenes: () => [] }, pause: vi.fn(), stop: vi.fn(), launch },
      events: { once: vi.fn() },
      add: { nineslice: panel, bitmapText: sprite },
      input: { keyboard: { addKeys: () => ({}) } },
    })
    debug.create()
    const options = (debug as unknown as { options: { label: string; run: () => void }[] }).options
    const args = panel.mock.calls[0] as unknown as [number, number, string, number, number, number]
    expect(args[1]).toBeGreaterThanOrEqual(0)
    expect(args[1] + args[5]).toBeLessThanOrEqual(360)
    options.find((o) => o.label === 'glass i: west island')!.run()
    expect(world.player).toMatchObject({ x: 10, y: 17, facing: 'left' })
    expect(tileAt(world, 9, 17)).toBe('salt')
    options.find((o) => o.label === 'glass i for etarp')!.run()
    expect(world.inventory.glassi).toBe(1)
    expect(world.dialogue).toMatchObject({ key: 'pirate', node: '21' })
    options.find((o) => o.label === 'leaving with etarip')!.run()
    expect(world.flags['etarp:i']).toBe(true)
    expect(world.flags['name:Etarp']).toBe('etarip')
    expect(world.dialogue).toMatchObject({ key: 'tarq', node: 'ask' })
    expect(launch).toHaveBeenCalledTimes(3)
    expect(launch).toHaveBeenCalledWith('island', {})
    vi.unstubAllGlobals()
  })
})
