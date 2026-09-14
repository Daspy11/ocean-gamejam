import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { blast } from './machine'
import { choices } from './throw'
import { createWorld, npc, tileIndex, type Content, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['cannon', 'tarq', 'etarip-farewell'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

function setup(peace: boolean, letter: 'held' | 'returned' | 'missing') {
  const w = createWorld()
  w.objects = w.objects.filter((o) => o.id !== 'orb1' && o.kind !== 'chair')
  w.objects.push(
    npc('walter', 'walter', 17, 16, 'left', ''),
    npc('etarp', 'etarp', 22, 2, 'down', 'etarp'),
    npc('seahorse', 'seahorse', 13, 15, 'right', 'seahorse'),
    { id: 'egg', kind: 'egg', x: 15, y: 17 },
    { id: 'chair', kind: 'chair', x: 16, y: 18 },
  )
  for (let y = 3; y <= 13; y++) w.tiles[tileIndex(w, 20, y)] = 'salt'
  blast(w, 13, 14)
  Object.assign(w.player, { x: 16, y: 17, facing: 'left' })
  w.flags['seahorse:peace'] = peace
  if (letter === 'held') w.inventory.glassi = 1
  if (letter === 'returned') Object.assign(w.flags, { 'etarp:i': true, 'name:Etarp': 'etarip' })
  apply(w, { type: 'talk', key: 'cannon' }, content)
  return w
}

function reach(w: World, key: string, node: string, dt = 100) {
  for (let i = 0; i < 2000 && (w.dialogue?.key !== key || w.dialogue.node !== node); i++) {
    const d = w.dialogue
    const on = d && content.dialogues[d.key].nodes[d.node]
    if (on?.text !== undefined && !w.closeup?.auto) apply(w, { type: 'interact' }, content)
    else apply(w, { type: 'tick', dt }, content)
  }
  expect(w.dialogue).toMatchObject({ key, node })
}

describe('Etarip and dr. sceantist', () => {
  it.each([false, true])('returns a carried i after the cannon declaration, peace: %s', (peace) => {
    const w = setup(peace, 'held')
    reach(w, 'cannon', '3')
    expect(w.typing?.text).toBe("YARR, DON'T LET THAT SEA HORSE NEAR THIS ISLAND.")
    apply(w, { type: 'interact' }, content)
    expect(w.typing).toMatchObject({ who: 'You', text: 'we found your i by the way' })
    apply(w, { type: 'interact' }, content)
    expect(w.player.path?.length).toBeGreaterThan(0)
    expect(w.inventory.glassi).toBe(1)
    reach(w, 'cannon', 'iMine')
    const etarp = w.objects.find((o) => o.id === 'etarp')!
    expect(Math.abs(w.player.x - etarp.x) + Math.abs(w.player.y - etarp.y)).toBe(1)
    expect(w.inventory.glassi).toBeUndefined()
    expect(w.typing).toMatchObject({ who: 'Etarp', text: 'ME I!' })
    expect(w.flags['name:Etarp']).toBeUndefined()
    apply(w, { type: 'tick', dt: 4000 }, content)
    apply(w, { type: 'interact' }, content)
    expect(w.typing?.text).toBe('BLESSINS BE UPON YOUS')
    expect(w.flags['name:Etarp']).toBe('etarip')
    expect(w.flags['etarp:i']).toBe(true)
    reach(w, 'cannon', peace ? 'dontShoot' : 'rage')
  })

  it.each([
    [false, 'missing'],
    [false, 'returned'],
    [true, 'missing'],
  ] as const)('still fires without both gifts: peace %s, i %s', (peace, letter) => {
    const w = setup(peace, letter)
    reach(w, 'cannon', '9')
    expect(w.objects.find((o) => o.id === 'cannon')).toHaveProperty('firing')
    expect(w.flags['etarp:peace']).toBeUndefined()
    reach(w, 'tarq', '5')
    expect(w.typing?.text).toBe(
      'i was just gonna watch but seriously how did you mess this up so badly',
    )
  })

  it.each(['held', 'returned'] as const)(
    'reconciles, rides, throws, and leaves peacefully with the i %s',
    (letter) => {
      let w = setup(true, letter)
      const score = w.score
      reach(w, 'cannon', 'dontShoot')
      for (const [who, text] of [
        ['dr. sceantist', "...don't shoot"],
        ['etarip', 'i am only half a man thanks to you'],
        ['dr. sceantist', 'i am so sorry'],
        ['dr. sceantist', 'it was an accident'],
        ['dr. sceantist', 'my... experiment went wrong'],
        ['etarip', "that doesn't help me"],
        ['etarip', 'i am still backwards'],
        ['etarip', "i can't hold down a job because i can only make backwards cocktails"],
        ['etarip', 'like this stupid otijom'],
        ['dr. sceantist', '...'],
        ['dr. sceantist', 'i can help you find a cure'],
        ['etarip', '...you can?'],
        ['dr. sceantist', 'maybe idk honestly'],
        ['etarip', "that's good enough for me"],
        ['dr. sceantist', 'RIDE ME INTO THE SUNSET'],
        ['etarip', 'TOGETHER WE SHALL FIND A CURE'],
      ]) {
        expect(w.typing?.text).toBe(text)
        expect(w.flags[`name:${w.typing?.who}`] ?? w.typing?.who).toBe(who)
        apply(w, { type: 'interact' }, content)
      }
      reach(w, 'cannon', 'ride')
      const horse = w.objects.find((o) => o.id === 'seahorse')!
      const etarp = w.objects.find((o) => o.id === 'etarp')!
      expect(etarp).toMatchObject({ ride: 'seahorse', x: horse.x, y: horse.y })
      expect(etarp.kind === 'npc' && etarp.hop).toBeTruthy()
      expect(w.dialogue?.key).toBe('cannon')
      w = JSON.parse(JSON.stringify(w))
      reach(w, 'tarq', 'twist')
      expect(w.objects.find((o) => o.id === 'etarp')).toMatchObject({ ride: 'seahorse' })
      expect(w.objects.find((o) => o.id === 'etarp')).not.toHaveProperty('hop')
      expect(w.typing).toMatchObject({ who: 'Tarq', text: 'what an epic plot twist' })
      expect(w.flags['etarp:peace']).toBe(true)
      expect(w.score).toBe(score)
      reach(w, 'tarq', 'pick')
      const offered = choices(w, content.dialogues.tarq.nodes.pick, content.dialogues.tarq)
      expect(offered.map((o) => o.next)).toEqual(['chair', 'egg'])
      apply(w, { type: 'interact' }, content)
      reach(w, 'tarq', 'chairReply')
      expect(w.typing?.text).toBe('i could sit and watch this for hours')
      reach(w, 'tarq', 'pick')
      apply(w, { type: 'interact' }, content)
      reach(w, 'tarq', 'ow')
      expect(w.objects.find((o) => o.id === 'tarq')).toMatchObject({ flat: true })
      reach(w, 'tarq', 'ask')
      const lines: string[] = []
      for (let i = 0; i < 1000 && !w.flags.outro; i++) {
        if (w.typing) {
          lines.push(w.typing.text)
          apply(w, { type: 'interact' }, content)
        } else apply(w, { type: 'tick', dt: 100 }, content)
        expect(w.objects.some((o) => o.kind === 'cannon' && o.firing)).toBe(false)
      }
      expect(w.flags.outro).toBe(true)
      expect(lines).not.toContain('YARR, WE SETTLE THIS NOW')
      expect(w.objects.some((o) => o.id === 'cannon2' || o.kind === 'embedded')).toBe(false)
      expect(w.player.ride).toBe('flyingcarpet1')
      reach(w, 'etarip-farewell', 'science')
      expect(w.typing?.text).toBe(
        'WITH THE POWER OF SCIENCE AND PIRACY, WE WILL PLUNDER THE CURE FROM ANY WHO CROSS OUR PATH',
      )
      apply(w, { type: 'interact' }, content)
      expect(w.typing?.text).toBe('YARR')
      apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 0 }, content)
      expect(w.farewell?.phase).toBe('leave')
      reach(w, 'etarip-farewell', 'mich')
      expect(w.farewell?.phase).toBe('gone')
      apply(w, { type: 'interact' }, content)
      apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 100 }, content)
      apply(w, { type: 'tick', dt: 100 }, content)
      expect(w.farewell?.phase).toBe('done')
    },
  )
})
