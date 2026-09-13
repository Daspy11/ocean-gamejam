import type Phaser from 'phaser'
import { AUDIO } from '../assets'
import { tileAt, type Obj } from '../game/world'
import { settings, world } from '../store'

// Game-clock fading keeps one loop alive across the intro, island and cave scene handovers.
export function background(scene: Phaser.Scene): void {
  const { sound, game } = scene
  if (sound.get('music/ambient')) return
  const music = sound.add('music/ambient', {
    loop: true,
    volume: 0,
    mute: !settings.music,
  }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound
  music.play()
  const fade = (_time: number, delta: number) => {
    const featured = sound.get('music/nowhereland') || sound.get('music/saltyditty')
    const target = world.flags.outro || featured ? 0 : 0.175
    const step = (0.175 * Math.max(0, delta)) / 1500
    music.setVolume(
      music.volume < target
        ? Math.min(target, music.volume + step)
        : Math.max(target, music.volume - step),
    )
  }
  game.events.on('step', fade)
  music.once('destroy', () => game.events.off('step', fade))
}

export function playChime(scene: Phaser.Scene): void {
  if (settings.sfx && !scene.sound.mute && !scene.sound.locked) scene.sound.play('sfx/chime')
}

// Observe existing sim timestamps so pauses, redraws and loaded snapshots cannot replay cues.
export function hearWorld(scene: Phaser.Scene) {
  let before = world
  let at = world.time
  let interact = world.interactCue ?? 0
  let chime = world.chimeCue ?? 0
  let closeup = world.closeup
  let power: Phaser.Sound.BaseSound | undefined
  let wrecks = new Set(world.objects.filter((o) => o.kind === 'boat' && o.wrecked).map((o) => o.id))
  const hisses = new Map<Obj, Phaser.Sound.BaseSound>()
  let ditty: Phaser.Sound.BaseSound | undefined
  let fade: Phaser.Tweens.Tween | undefined
  const stopMusic = () => {
    fade?.stop()
    ditty?.destroy()
    ditty = fade = undefined
  }
  const stop = () => {
    for (const sound of hisses.values()) sound.destroy()
    hisses.clear()
    scene.sound.stopByKey('sfx/crash')
    scene.sound.stopByKey('sfx/interact')
  }
  const tick = () => {
    const reset = before !== world || world.time < at
    if (reset) stopMusic()
    const audible = settings.sfx && !settings.open && !scene.sound.mute && !scene.sound.locked
    if (reset || !audible) stop()
    const boiling = world.objects.filter(
      (o) => o.kind === 'orb' && world.time < o.doneAt && tileAt(world, o.x, o.y) === 'water',
    )
    for (const [orb, sound] of hisses)
      if (!boiling.includes(orb)) {
        sound.destroy()
        hisses.delete(orb)
      }
    const crashed = world.objects.filter((o) => o.kind === 'boat' && o.wrecked)
    const d = world.dialogue
    const c = world.closeup
    const powering =
      d?.key === 'flower' && c?.sheet === 'walter' && c.burst !== undefined && c.down === undefined
    const end = powering && typeof c.burst === 'number' ? c.burst + 1200 : Infinity
    if (
      power &&
      (reset ||
        !powering ||
        world.time >= end ||
        !settings.sfx ||
        scene.sound.mute ||
        scene.sound.locked)
    ) {
      power.destroy()
      power = undefined
    }
    if (settings.open) power?.pause()
    const entering =
      d?.key === 'pirate' &&
      ['1', '2', '3', '4'].includes(d.node) &&
      !crashed.some((o) => o.id === 'ship')
    if (!entering) stopMusic()
    else if (!ditty) {
      ditty = scene.sound.add('music/saltyditty', { loop: true, volume: 0, mute: !settings.music })
      ditty.play()
      fade = scene.tweens.add({
        targets: ditty,
        volume: 0.6,
        duration: 1500,
        ease: 'Sine.easeInOut',
      })
    }
    if (!reset && audible) {
      if (powering && c !== closeup && world.time < end) {
        power = scene.sound.add('sfx/powerup')
        power.play()
      }
      if ((world.chimeCue ?? 0) > chime || (at < end && world.time >= end)) playChime(scene)
      else if ((world.interactCue ?? 0) > interact) scene.sound.play('sfx/interact')
      for (const boat of crashed) if (!wrecks.has(boat.id)) scene.sound.play('sfx/crash')
      for (const orb of boiling) {
        if (orb.kind !== 'orb') continue
        const landed = orb.doneAt - 1700 // the first 300 ms of the two-second throw are airborne
        const pulse = Math.min(2, Math.floor((world.time - landed) / 550))
        // One current burst after a slow frame, never a pile of overdue sounds at once.
        if (pulse < 0 || at >= landed + pulse * 550) continue
        const sound = hisses.get(orb) ?? scene.sound.add('sfx/hiss')
        hisses.set(orb, sound)
        sound.play()
      }
    }
    before = world
    at = world.time
    interact = world.interactCue ?? 0
    chime = world.chimeCue ?? 0
    closeup = c
    wrecks = new Set(crashed.map((o) => o.id))
  }
  const pause = () => {
    stop()
    interact = world.interactCue ?? 0
    chime = world.chimeCue ?? 0
    ditty?.pause()
    power?.pause()
  }
  const resume = () => {
    ditty?.resume()
    if (settings.sfx) power?.resume()
  }
  scene.events.on('postupdate', tick)
  scene.events.on('pause', pause)
  scene.events.on('resume', resume)
  scene.events.once('shutdown', () => {
    stop()
    stopMusic()
    power?.destroy()
    scene.events.off('postupdate', tick)
    scene.events.off('pause', pause)
    scene.events.off('resume', resume)
  })
}

export type Speech = { until: number; source?: AudioBufferSourceNode; gain?: GainNode }

export function stopSpeech(speech: Speech) {
  if (speech.source && speech.gain) {
    const now = speech.gain.context.currentTime
    speech.gain.gain.cancelScheduledValues(now)
    speech.gain.gain.setTargetAtTime(0, now, 0.002)
    speech.source.stop(now + 0.006)
  }
  speech.source = undefined
  speech.gain = undefined
  speech.until = 0
}

// Editable through window.island.voices while we tune the cast by ear.
export const VOICES: Record<
  string,
  | { hz: number; wave: OscillatorType; volume: number; ms?: number }
  | { sample: keyof typeof AUDIO; rate: number; volume: number; ms: number; gap: number }
> = {
  mich: { sample: 'voices/mich', rate: 1.8, volume: 0.65, ms: 110, gap: 12 },
  walter: { sample: 'voices/walter', rate: 2, volume: 0.65, ms: 110, gap: 12 },
  etarp: { sample: 'voices/etarp', rate: 1, volume: 0.65, ms: 110, gap: 12 },
  "golfer's delight": { hz: 620, wave: 'sine', volume: 0.06 },
  'antoine le shrimp': { sample: 'voices/antoine', rate: 1.8, volume: 0.65, ms: 110, gap: 12 },
  'suspicious harry': { sample: 'voices/harry', rate: 1.8, volume: 0.65, ms: 110, gap: 12 },
  'sea horse': { hz: 280, wave: 'square', volume: 0.025 },
  tarq: { sample: 'voices/tarq', rate: 1, volume: 0.65, ms: 110, gap: 12 },
  tree: { hz: 95, wave: 'square', volume: 0.025 },
  'tree 2': { hz: 125, wave: 'square', volume: 0.025 },
  chest: { hz: 330, wave: 'sawtooth', volume: 0.035 },
}
VOICES.etarip = VOICES.etarp

export function speak(
  scene: Phaser.Scene,
  who: string,
  text: string,
  from: number,
  to: number,
  speech: Speech = { until: 0 },
) {
  const voice = VOICES[who.toLowerCase()]
  const sound = scene.sound as Phaser.Sound.WebAudioSoundManager | undefined
  const ctx = sound?.context
  // Never replay a backlog after a skipped line, a slow frame or suspended audio.
  if (!settings.sfx || !voice || !ctx || ctx.state !== 'running' || sound.mute || to - from > 4)
    return
  if ('sample' in voice) {
    // Follow the visible letters, but never queue speech behind fast text or overlap syllables.
    if (ctx.currentTime < speech.until) return
    const letter = text.slice(from, to).toLowerCase().match(/[a-z]/)?.[0]
    const letters: Record<string, number[]> = AUDIO[voice.sample].letters
    const marker = letter && letters[letter]
    const buffer: AudioBuffer | undefined = scene.cache.audio.get(voice.sample)
    if (!marker || !buffer) return
    const at = ctx.currentTime
    const duration = Math.min(voice.ms / 1000, marker[1] / voice.rate)
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.playbackRate.setValueAtTime(voice.rate, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(voice.volume, at + 0.004)
    gain.gain.setValueAtTime(voice.volume, at + Math.max(0.004, duration - 0.012))
    gain.gain.linearRampToValueAtTime(0, at + duration)
    source.connect(gain)
    gain.connect(sound.destination)
    speech.source = source
    speech.gain = gain
    speech.until = at + duration + voice.gap / 1000
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (speech.source === source) {
        speech.source = undefined
        speech.gain = undefined
      }
    }
    source.start(at, marker[0], duration * voice.rate)
    return
  }
  let offset = 0
  for (const char of text.slice(from, to)) {
    const at = ctx.currentTime + offset
    const end = at + (voice.ms ?? 22) / 1000
    offset += 0.014
    if (!/[\p{L}\p{N}]/u.test(char)) continue
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = voice.wave
    oscillator.frequency.setValueAtTime(voice.hz, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(voice.volume, at + 0.002)
    gain.gain.linearRampToValueAtTime(0, end)
    oscillator.connect(gain)
    gain.connect(sound.destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(at)
    oscillator.stop(end)
  }
}
