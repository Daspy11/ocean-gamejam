import { readFileSync, readdirSync } from 'node:fs'
import type Phaser from 'phaser'
import { describe, expect, it, vi } from 'vitest'
import type { Dialogue } from '../game/world'
import { AUDIO } from '../assets'
import { settings } from '../store'
import { speak, stopSpeech, VOICES, type Speech } from './speech'

function audio() {
  const oscillator = {
    type: '',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: undefined as (() => void) | undefined,
  }
  const gain = {
    context: { currentTime: 10 },
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const source = { ...oscillator, buffer: undefined, playbackRate: { setValueAtTime: vi.fn() } }
  const buffer = {}
  const sound = {
    mute: false,
    destination: {},
    context: {
      state: 'running',
      currentTime: 10,
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      createBufferSource: vi.fn(() => source),
    },
  }
  return {
    scene: { sound, cache: { audio: { get: vi.fn(() => buffer) } } } as unknown as Phaser.Scene,
    sound,
    oscillator,
    gain,
    source,
    buffer,
  }
}

describe('speech audio', () => {
  it('uses the sfx switch independently of music', () => {
    const { scene, sound } = audio()
    try {
      settings.sfx = false
      speak(scene, 'Mich', 'a', 0, 1)
      expect(sound.context.createBufferSource).not.toHaveBeenCalled()
      settings.sfx = true
      settings.music = false
      speak(scene, 'Mich', 'a', 0, 1)
      expect(sound.context.createBufferSource).toHaveBeenCalledOnce()
    } finally {
      settings.music = settings.sfx = true
    }
  })
  it('plays only new letters, preserves gaps, and follows Phaser volume and mute routing', () => {
    const { scene, sound, oscillator, gain } = audio()
    speak(scene, 'tree', 'a b.', 0, 4)
    expect(sound.context.createOscillator).toHaveBeenCalledTimes(2)
    expect(oscillator.start.mock.calls).toEqual([[10], [10.028]])
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(95, 10)
    expect(gain.connect).toHaveBeenCalledWith(sound.destination)
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 10)
    expect(oscillator.stop).toHaveBeenCalledWith(10.022)
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.022)
    oscillator.onended!()
    expect(oscillator.disconnect).toHaveBeenCalledOnce()
    expect(gain.disconnect).toHaveBeenCalledOnce()
  })

  it('does not sound narration, punctuation, repeats, or a backlog', () => {
    const { scene, sound } = audio()
    speak(scene, '', 'abc', 0, 3)
    speak(scene, 'Mich', ' .,!', 0, 4)
    speak(scene, 'Mich', 'abc', 3, 3)
    speak(scene, 'Mich', '[PLACEHOLDER line]', 0, 18)
    speak(scene, 'Mich', '[PLACEHOLDER line]', 0, Infinity)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
    expect(sound.context.createBufferSource).not.toHaveBeenCalled()
  })

  it('keeps You and player silent in either scene', () => {
    const { scene, sound } = audio()
    for (const who of ['You', 'you', 'Player', 'player']) speak(scene, who, 'abc', 0, 3)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
    expect(sound.context.createBufferSource).not.toHaveBeenCalled()
  })

  it('stays silent while muted, locked, or without Web Audio', () => {
    const { scene, sound } = audio()
    sound.mute = true
    speak(scene, 'Mich', 'a', 0, 1)
    sound.mute = false
    sound.context.state = 'suspended'
    speak(scene, 'Mich', 'a', 0, 1)
    speak({ sound: {} } as Phaser.Scene, 'Mich', 'a', 0, 1)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('has a voice for every authored NPC, preserving Etarp through his rename', () => {
    const dir = new URL('../../assets/dialogue/', import.meta.url)
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const dialogue: Dialogue = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
      for (const node of Object.values(dialogue.nodes)) {
        if (node.text === undefined) continue
        const who = node.who === '' ? 'You' : node.who === null ? '' : (node.who ?? dialogue.name)
        if (who && who.toLowerCase() !== 'you')
          expect(VOICES[who.toLowerCase()], `${file}: ${who}`).toBeDefined()
      }
    }
    expect(VOICES.etarip).toBe(VOICES.etarp)
    expect(VOICES.mich).toHaveProperty('sample', 'voices/mich')
  })

  it('reads Mich from the recorded letter, with higher pitch and no overlapping samples', () => {
    const { scene, sound, source, gain, buffer } = audio()
    const speech: Speech = { until: 0 }
    speak(scene, 'Mich', 'Abc', 0, 1, speech)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
    expect(source.buffer).toBe(buffer)
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.8, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/mich'].letters.a[0], 0.11 * 1.8)
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.11)
    sound.context.currentTime = 10.05
    speak(scene, 'Mich', 'Abc', 1, 2, speech)
    expect(sound.context.createBufferSource).toHaveBeenCalledOnce()
    sound.context.currentTime = 10.13
    speak(scene, 'Mich', 'Abc', 2, 3, speech)
    expect(source.start).toHaveBeenLastCalledWith(
      10.13,
      AUDIO['voices/mich'].letters.c[0],
      0.11 * 1.8,
    )
    source.onended!()
    expect(speech.source).toBeUndefined()
    expect(source.disconnect).toHaveBeenCalledOnce()
  })

  it('fades a recorded syllable out on skip or scene shutdown and forgets the old cadence', () => {
    const { scene, source, gain } = audio()
    const speech: Speech = { until: 0 }
    speak(scene, 'Mich', 'a', 0, 1, speech)
    stopSpeech(speech)
    expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(10)
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10, 0.002)
    expect(source.stop).toHaveBeenCalledWith(10.006)
    expect(speech).toEqual({ until: 0, source: undefined, gain: undefined })
  })

  it.each(['Etarp', 'etarip'])("uses Etarp's recording for %s", (who) => {
    const { scene, source, sound } = audio()
    speak(scene, who, 'b', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/etarp')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/etarp'].letters.b[0], 0.11)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('plays Harry from his processed recording at 1.8x', () => {
    const { scene, source, sound } = audio()
    speak(scene, 'suspicious harry', 'c', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/harry')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.8, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/harry'].letters.c[0], 0.11 * 1.8)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('plays Antoine from his pitch-lowered recording at 1.8x', () => {
    const { scene, source, sound } = audio()
    speak(scene, 'antoine le shrimp', 'c', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/antoine')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.8, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/antoine'].letters.c[0], 0.11 * 1.8)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('plays Tarq from recording six at its original rate', () => {
    const { scene, source, sound } = audio()
    speak(scene, 'Tarq', 'c', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/tarq')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/tarq'].letters.c[0], 0.11)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('plays Walter from his pitch-lowered replacement recording at 2x', () => {
    const { scene, source, sound } = audio()
    speak(scene, 'Walter', 'c', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/walter')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/walter'].letters.c[0], 0.11 * 2)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it('plays dr. sceantist from his recording at its original rate', () => {
    const { scene, source, sound } = audio()
    speak(scene, 'dr. sceantist', 'c', 0, 1, { until: 0 })
    expect(scene.cache.audio.get).toHaveBeenCalledWith('voices/seahorse')
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 10)
    expect(source.start).toHaveBeenCalledWith(10, AUDIO['voices/seahorse'].letters.c[0], 0.11)
    expect(sound.context.createOscillator).not.toHaveBeenCalled()
  })

  it.each(['mich', 'etarp', 'harry', 'antoine', 'tarq', 'walter', 'seahorse'] as const)(
    'ships 26 valid letter markers for %s',
    (who) => {
      const wav = readFileSync(new URL(`../../audio/${who}.wav`, import.meta.url))
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
      expect(wav.readUInt16LE(20)).toBe(1)
      expect(wav.readUInt16LE(22)).toBe(1)
      expect(wav.readUInt32LE(24)).toBe(24000)
      expect(wav.readUInt16LE(34)).toBe(16)
      const letters = AUDIO[`voices/${who}`].letters
      expect(Object.keys(letters).join('')).toBe('abcdefghijklmnopqrstuvwxyz')
      const duration = wav.readUInt32LE(40) / 48000
      let end = 0
      for (const [start, length] of Object.values(letters)) {
        expect(start).toBeGreaterThanOrEqual(end)
        expect(length).toBeGreaterThan(0.2)
        end = start + length
        expect(end).toBeLessThanOrEqual(duration)
        const first = 44 + Math.round(start * 24000) * 2
        const last = 44 + Math.round(end * 24000) * 2
        expect(wav.readInt16LE(first)).toBe(0)
        expect(wav.readInt16LE(last - 2)).toBe(0)
        let peak = 0
        for (let offset = first; offset < last; offset += 2)
          peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)))
        expect(peak).toBeGreaterThan(1000)
        expect(peak).toBeLessThan(30000)
      }
    },
  )
})
