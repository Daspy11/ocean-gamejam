import Phaser from 'phaser'
import { MUSIC } from '../assets'
import type { Dir } from '../game/world'
import { settings } from '../store'
import { playChime } from './speech'

export const KEYS = 'UP,DOWN,LEFT,RIGHT,W,A,S,D,SHIFT,E,SPACE,ENTER,Z,I,TAB,ESC,X,C'

// These bindings feed the title, dialogue, world, ending and settings alike.
export function bindControls(scene: Phaser.Scene, clickConfirms = true) {
  const keys = scene.input.keyboard!.addKeys(KEYS) as Record<string, Phaser.Input.Keyboard.Key>
  let click = false
  let back = false
  let previous = new Set<number>()
  let direction: Dir | null = null
  let reset = true
  const pointer = (p: Phaser.Input.Pointer) => {
    if (p?.button === 2) back = true
    else if (!p || p.button === 0) click = true
  }
  scene.input.on('pointerdown', pointer)
  const flush = () => {
    click = back = false
    reset = true
    for (const key of Object.values(keys)) Phaser.Input.Keyboard.JustDown(key)
  }
  scene.events.on('resume', flush)
  scene.events.on('controls-reset', flush)
  scene.events.once('shutdown', () => {
    scene.input.off('pointerdown', pointer)
    scene.events.off('resume', flush)
    scene.events.off('controls-reset', flush)
  })
  return (allowClick = clickConfirms) => {
    const pressed = new Set(
      Object.entries(keys)
        .filter(([, key]) => Phaser.Input.Keyboard.JustDown(key) && !key.originalEvent?.repeat)
        .map(([k]) => k),
    )
    let pads: (Gamepad | null)[] = []
    try {
      if (typeof navigator !== 'undefined') pads = navigator.getGamepads?.() ?? []
    } catch {
      // Some embedded players deny gamepad access; keyboard and mouse still work.
    }
    const pad = pads.find((pad) => pad?.connected && pad.mapping === 'standard')
    const held = new Set<number>()
    pad?.buttons.forEach((button, i) => {
      if (button.pressed) held.add(i)
    })
    const x = pad?.axes[0] ?? 0
    const y = pad?.axes[1] ?? 0
    if (Math.max(Math.abs(x), Math.abs(y)) > 0.4) {
      held.add(Math.abs(x) > Math.abs(y) ? (x < 0 ? 14 : 15) : y < 0 ? 12 : 13)
    }
    const edge = (button: number) => !reset && held.has(button) && !previous.has(button)
    let dir: Dir | null = null
    let at = -1
    for (const [d, names, button] of [
      ['up', ['UP', 'W'], 12],
      ['down', ['DOWN', 'S'], 13],
      ['left', ['LEFT', 'A'], 14],
      ['right', ['RIGHT', 'D'], 15],
    ] as [Dir, string[], number][]) {
      if (held.has(button) && at < 0) dir = d
      for (const name of names) {
        const key = keys[name]
        if (key?.isDown && key.timeDown >= at) [at, dir] = [key.timeDown, d]
      }
    }
    const key = ['E', 'SPACE', 'ENTER', 'Z'].find((k) => pressed.has(k))
    const id = pad?.id ?? ''
    const button = /054c|sony|playstation|dualshock|dualsense/i.test(id)
      ? 'Cross'
      : /057e|nintendo|switch/i.test(id)
        ? 'B'
        : /045e|xbox|xinput/i.test(id)
          ? 'A'
          : 'Bottom button'
    const confirmLabel = key
      ? key === 'ENTER'
        ? 'Enter'
        : key === 'SPACE'
          ? 'Space'
          : key
      : edge(0)
        ? button
        : allowClick && click
          ? 'Left click'
          : undefined
    const frame = {
      confirm: confirmLabel !== undefined,
      confirmLabel,
      settings: back || ['ESC', 'X', 'C'].some((k) => pressed.has(k)) || edge(1) || edge(9),
      inventory: ['I', 'TAB'].some((k) => pressed.has(k)) || edge(3),
      up: pressed.has('UP') || pressed.has('W') || (dir === 'up' && dir !== direction && !reset),
      down:
        pressed.has('DOWN') || pressed.has('S') || (dir === 'down' && dir !== direction && !reset),
      dir,
      run: !!keys.SHIFT?.isDown || held.has(7),
    }
    click = back = false
    previous = held
    direction = dir
    reset = false
    return frame
  }
}

export function openSettings(scene: Phaser.Scene, title = false) {
  if (settings.open) return
  settings.open = true // Block other active scenes before Phaser processes the launch queue.
  scene.scene.launch('settings', { title })
}

export default class Settings extends Phaser.Scene {
  private controls!: ReturnType<typeof bindControls>
  private options: Phaser.GameObjects.BitmapText[] = []
  private cursor = 0
  private marker!: Phaser.GameObjects.BitmapText

  constructor() {
    super('settings')
  }

  create(data: { title?: boolean } = {}) {
    playChime(this)
    settings.open = true
    this.cursor = 0
    this.controls = bindControls(this, false)
    const scenes = this.scene.manager.getScenes(true).filter((scene) => scene !== this)
    const paused = scenes.filter((scene) => !(data.title && scene.scene.key === 'intro'))
    const at = this.game.loop.time
    const wall = Date.now()
    for (const scene of paused) this.scene.pause(scene.scene.key)
    this.events.once('shutdown', () => {
      settings.open = false
      for (const scene of scenes) scene.events.emit('controls-reset')
      for (const scene of paused) {
        if (!scene.sys.isPaused()) continue
        scene.events.emit('settings-resume', this.game.loop.time - at)
        // Phaser tweens use wall time, unlike timers: exclude the time spent in settings.
        scene.tweens.startTime += Date.now() - wall
        scene.tweens.prevTime += Date.now() - wall
        this.scene.resume(scene.scene.key)
      }
    })
    this.scene.bringToTop()
    this.add.rectangle(0, 0, 640, 360, 0x000000, 0.65).setOrigin(0).setInteractive()
    this.add.nineslice(24, 36, 'ui/box', 0, 592, 288, 8, 8, 8, 8).setOrigin(0)
    this.add.bitmapText(48, 56, 'nihonium', 'settings').setOrigin(0, 0)
    this.options = ['music', 'sfx'].map((label, i) =>
      this.add.bitmapText(64, 88 + i * 24, 'basis33', label),
    )
    this.options.push(this.add.bitmapText(320, 296, 'basis33', 'close').setOrigin(0.5, 0))
    this.marker = this.add.bitmapText(48, 88, 'basis33', '>')
    this.add.bitmapText(48, 152, 'nihonium', 'keybinds')
    this.add.bitmapText(
      48,
      176,
      'basis33',
      [
        'move / select  Arrows / WASD / D-pad / left stick',
        'confirm        Enter / Space / E / Z / left click',
        '               Gamepad A / Cross (bottom button)',
        'settings       Esc / X / C / right click / B / Circle / Start',
        'inventory      I / Tab / Y / Triangle (top button)',
        'run (hold)     Shift / RT / R2',
      ].join('\n'),
    )
    this.draw()
  }

  update() {
    const input = this.controls()
    if (input.settings) {
      playChime(this)
      this.scene.stop()
      return
    }
    if (input.up) this.cursor = (this.cursor + 2) % 3
    if (input.down) this.cursor = (this.cursor + 1) % 3
    if ((input.up || input.down) && !input.confirm) playChime(this)
    if (input.confirm) {
      if (this.cursor === 2) {
        playChime(this)
        this.scene.stop()
        return
      }
      const key = this.cursor === 0 ? 'music' : 'sfx'
      settings[key] = !settings[key]
      playChime(this)
      if (key === 'music') {
        for (const key of Object.keys(MUSIC))
          for (const sound of this.sound.getAll(key))
            (sound as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setMute(
              !settings.music,
            )
      }
      try {
        localStorage.setItem(
          'boatiful-settings',
          JSON.stringify({ music: settings.music, sfx: settings.sfx }),
        )
      } catch {
        /* The switches still work when storage is unavailable. */
      }
    }
    this.draw()
  }

  private draw() {
    this.options[0].setText(`music: ${settings.music ? 'on' : 'off'}`)
    this.options[1].setText(`sfx: ${settings.sfx ? 'on' : 'off'}`)
    const option = this.options[this.cursor]
    this.marker.setX(option.x - (this.cursor === 2 ? option.width / 2 : 0) - 16).setY(option.y)
  }
}
