import type Phaser from 'phaser'
import { describe, expect, it, vi } from 'vitest'
import { createWorld, npc, type Obj, type Content } from '../game/world'
import { load, setContent } from '../store'
import { drawThrow, inTheAir } from './crash'
import { flyOut } from './leave'
import UI from './UI'

vi.mock('phaser', () => ({ default: { Scene: vi.fn() } }))

function sprite(x = 0, y = 0) {
  return {
    x,
    y,
    alpha: 1,
    depth: 0,
    height: 0,
    rotation: 0,
    visible: true,
    text: '' as string | string[],
    setPosition(x: number, y: number) {
      this.x = x
      this.y = y
      return this
    },
    setDepth(n: number) {
      this.depth = n
      return this
    },
    setAlpha(n: number) {
      this.alpha = n
      return this
    },
    setText(text: string | string[]) {
      this.text = text
      this.height = (Array.isArray(text) ? text : text.split('\n')).length * 16
      return this
    },
    setSize(_width: number, height: number) {
      this.height = height
      return this
    },
    setY(y: number) {
      this.y = y
      return this
    },
    setRotation(rotation: number) {
      this.rotation = rotation
      return this
    },
    setTexture() {
      return this
    },
    setFrame() {
      return this
    },
    setScale() {
      return this
    },
    setOrigin() {
      return this
    },
    setDropShadow() {
      return this
    },
    setVisible(visible: boolean) {
      this.visible = visible
      return this
    },
    setTintFill() {
      return this
    },
    setMaxWidth() {
      return this
    },
    clear() {
      return this
    },
  }
}

describe('the flight out', () => {
  it('draws a throw on a straight line with continuing rotation past its target', () => {
    const w = createWorld()
    w.throwing = {
      kind: 'seal',
      object: 'bag:seal:0',
      at: 'tarq',
      flight: { x: 10, y: 10, vx: 20, vy: -10, at: 0, hitAt: 200, until: 1600 },
    }
    load(w)
    const drawn = sprite()
    for (const time of [100, 200, 300, 1500]) {
      w.time = time
      drawThrow(drawn as unknown as Phaser.GameObjects.Sprite)
      expect([drawn.x, drawn.y]).toEqual([
        (10 + (20 * time) / 1000) * 16,
        (10 - (10 * time) / 1000) * 16,
      ])
      expect(drawn.rotation).toBeCloseTo((time / 1000) * 12)
      expect(drawn.visible).toBe(true)
    }
    w.time = 1600
    drawThrow(drawn as unknown as Phaser.GameObjects.Sprite)
    expect(drawn.visible).toBe(false)
  })

  it('fits all six throw choices and their cursor inside the dialogue panel', () => {
    const w = createWorld()
    const c: Content = {
      dialogues: {
        pick: {
          name: '',
          start: [{ node: 'pick' }],
          nodes: {
            pick: {
              text: '[PLACEHOLDER pick]',
              choices: Array.from({ length: 6 }, () => ({
                text: '[PLACEHOLDER item]',
                next: null,
              })),
            },
          },
        },
      },
      items: {},
    }
    setContent(c)
    w.dialogue = { key: 'pick', node: 'pick', choice: 5 }
    load(w)
    const texts: ReturnType<typeof sprite>[] = []
    const panels: ReturnType<typeof sprite>[] = []
    const ui = new UI()
    Object.assign(ui, {
      add: {
        rectangle: sprite,
        graphics: sprite,
        image: sprite,
        nineslice: () => {
          const s = sprite()
          panels.push(s)
          return s
        },
        bitmapText: () => {
          const s = sprite()
          texts.push(s)
          return s
        },
      },
    })
    ui.create()
    expect(texts[2].text.toString()).toContain('> [PLACEHOLDER item]')
    expect(texts[2].y + texts[2].height).toBeLessThanOrEqual(panels[0].y + panels[0].height - 8)
    expect(panels[0].y).toBeGreaterThanOrEqual(0)
    setContent({ dialogues: {}, items: {} })
  })

  it('keeps the grounded carpet under people approaching from every side, then above the battle', () => {
    const w = createWorld()
    const rug: Obj = { id: 'rug', kind: 'flyingcarpet', x: 18, y: 17, landAt: 0 }
    const drawn = sprite()
    load(w)
    w.time = 2999
    inTheAir(drawn as unknown as Phaser.GameObjects.Sprite, rug)
    expect(drawn.depth).toBe(9000)
    w.time = 3000
    inTheAir(drawn as unknown as Phaser.GameObjects.Sprite, rug)
    expect(drawn.depth).toBeGreaterThan(0) // above the terrain
    for (const feet of [17 * 16, 17.5 * 16, 18 * 16, 18.5 * 16, 19 * 16])
      expect(drawn.depth).toBeLessThan(feet) // Walter stays visible from above, beside or below
    delete rug.landAt
    rug.liftAt = w.time
    inTheAir(drawn as unknown as Phaser.GameObjects.Sprite, rug)
    expect(drawn.depth).toBeLessThan(17 * 16)
    w.time++
    inTheAir(drawn as unknown as Phaser.GameObjects.Sprite, rug)
    expect(drawn.depth).toBe(9000)
  })

  it('keeps the crew together as they accelerate past the camera before the iris closes', () => {
    const w = createWorld()
    w.objects = [
      { id: 'rug', kind: 'flyingcarpet', x: 32, y: 17 },
      Object.assign(npc('mich', 'mich', 32, 17, 'right', ''), { ride: 'rug' }),
      Object.assign(npc('walter', 'walter', 32, 17, 'down', ''), { ride: 'mich' }),
    ]
    w.player.ride = 'rug'
    load(w)
    const rug = sprite(512, 264)
    const mich = sprite(503, 254)
    const walter = sprite(504, 239)
    const player = sprite(521, 254)
    const crew = [rug, mich, walter]
    const camera = {
      midPoint: { x: 520, y: 258 },
      zoom: 2,
      stopFollow: vi.fn(),
      removeBounds: vi.fn(),
      setZoom(n: number) {
        this.zoom = n
        return this
      },
      centerOn(x: number, y: number) {
        this.midPoint = { x, y }
        return this
      },
    }
    const scene = {
      cameras: { main: camera },
      scene: { launch: vi.fn(), stop: vi.fn() },
      add: { tileSprite: sprite, image: sprite },
      tweens: { add: vi.fn() },
      events: { on: vi.fn(), once: vi.fn() },
    }
    flyOut(
      scene as unknown as Phaser.Scene,
      () => crew as unknown as Phaser.GameObjects.Sprite[],
      player as unknown as Phaser.GameObjects.Sprite,
      sprite() as unknown as Phaser.GameObjects.Sprite,
    )
    const tick = scene.events.on.mock.calls[0][1] as (now: number, dt: number) => void
    const positions: number[] = []
    for (let time = 100; time <= 18000; time += 100) {
      // Island redraws the base poses before the departure callback applies its offsets.
      rug.setPosition(512, 264)
      mich.setPosition(503, 254)
      walter.setPosition(504, 239)
      player.setPosition(521, 254)
      tick(time, 100)
      expect([walter.x - mich.x, walter.y - mich.y]).toEqual([1, -15])
      if (time >= 15600) positions.push((rug.x - camera.midPoint.x) * camera.zoom)
      if (time < 18000) expect(scene.scene.launch).not.toHaveBeenCalled()
    }
    expect(positions[1] - positions[0]).toBeLessThan(positions[5] - positions[4])
    expect(positions.at(-1)).toBeGreaterThan(640 / 2 + 32 * camera.zoom)
    expect(scene.scene.launch).toHaveBeenCalledWith('outro')
    expect(scene.scene.stop).not.toHaveBeenCalledWith('ui')
  })

  it('keeps the changing score visible while the HUD fades over four seconds', () => {
    const w = createWorld()
    w.flags['score:on'] = true
    w.score = 15
    load(w)
    const texts: ReturnType<typeof sprite>[] = []
    const ui = new UI()
    Object.assign(ui, {
      add: {
        rectangle: sprite,
        graphics: sprite,
        image: sprite,
        nineslice: sprite,
        bitmapText: () => {
          const s = sprite()
          texts.push(s)
          return s
        },
      },
    })
    ui.create()
    w.flags.outro = true
    ui.update()
    expect(texts[0].alpha).toBe(1)
    w.time += 2000
    w.score = -185
    w.rev++
    ui.update()
    expect(texts[0].alpha).toBe(0.5)
    expect(texts[0].text).toBe('beauty: -185')
    w.time += 2000
    ui.update()
    expect(texts[0].alpha).toBe(0)
  })
})
