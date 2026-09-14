import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { createWorld, npc, tileAt, tileIndex, type Content, type World } from './world'

const content: Content = {
  dialogues: Object.fromEntries(
    ['seahorse', 'cannon', 'tarq'].map((key) => [
      key,
      JSON.parse(
        readFileSync(new URL(`../../assets/dialogue/${key}.json`, import.meta.url), 'utf8'),
      ),
    ]),
  ),
  items: {},
}

function setup(electrolytes: number) {
  const w = createWorld()
  w.objects = w.objects.filter((o) => o.id !== 'orb1')
  w.objects.push(npc('walter', 'walter', 17, 16, 'left', 'walter'))
  w.objects.push(npc('etarp', 'etarp', 22, 2, 'down', 'etarp'))
  for (let y = 3; y <= 13; y++) w.tiles[tileIndex(w, 20, y)] = 'salt'
  Object.assign(w.player, { x: 16, y: 17, facing: 'left' })
  w.inventory.electrolytes = electrolytes
  w.score = 30
  w.objects.push(
    { id: 'rug', kind: 'floor', x: 15, y: 18 },
    { id: 'egg', kind: 'egg', x: 16, y: 18 },
    { id: 'award', kind: 'certificate', x: 17, y: 18 },
  )
  w.flags['score:on'] = true
  apply(w, { type: 'tick', dt: 16 }, content)
  return w
}

function reach(w: World, key: string, node: string) {
  for (let i = 0; i < 1000 && (w.dialogue?.key !== key || w.dialogue?.node !== node); i++) {
    const d = w.dialogue
    const on = d && content.dialogues[d.key].nodes[d.node]
    if (on?.text !== undefined && !w.closeup?.auto) apply(w, { type: 'interact' }, content)
    else apply(w, { type: 'tick', dt: 100 }, content)
  }
  expect(w.dialogue).toMatchObject({ key, node })
}

describe('the electrolyte extractor introduction', () => {
  it('reconciles after actually giving both saved electrolytes and the carried i', () => {
    const w = setup(1)
    w.inventory.glassi = 1
    reach(w, 'cannon', '3')
    expect(w.flags['seahorse:peace']).toBe(true)
    expect(w.inventory.electrolytes).toBeUndefined()
    expect(w.inventory.glassi).toBe(1)
    reach(w, 'cannon', 'dontShoot')
    expect(w.flags['etarp:i']).toBe(true)
    expect(w.inventory.glassi).toBeUndefined()
    expect(w.typing?.text).toBe("...don't shoot")
    reach(w, 'tarq', 'twist')
    expect(w.flags['etarp:peace']).toBe(true)
    expect(w.objects.find((o) => o.id === 'etarp')).toMatchObject({ ride: 'seahorse' })
  })

  it('uses the new exchange, then explodes before asking about the saved electrolytes', () => {
    const w = setup(1)
    reach(w, 'seahorse', '3')
    const lines: string[] = []
    for (let i = 0; i < 8; i++) {
      lines.push(w.typing!.text)
      apply(w, { type: 'interact' }, content)
    }
    expect(lines).toEqual([
      'THIRTY BEAUTY???',
      'i wish i could appreciate it but i feel terrible',
      'holy HELL i need electrolytes',
      "can't you just drink seawater for that?",
      'SEAWATER??',
      'full of REGULAR OLD NORMAL ELECTROLYTES?',
      'do you understand how much water i would have to drink for that?',
      "if it's ok i will just put my electrolyte extractor here for a bit",
    ])
    expect(w.objects.some((o) => o.kind === 'machine')).toBe(true)
    reach(w, 'seahorse', '18')
    expect(w.typing?.text).toBe('NOOOOOOO my electrolyte extractor')
    expect(w.objects.some((o) => o.kind === 'machine')).toBe(false)
    expect(tileAt(w, 6, 14)).toBe('salt')
    expect(w.score).toBeLessThan(30)
    reach(w, 'seahorse', 'offer')
    expect(w.inventory.electrolytes).toBe(1)
    expect(content.dialogues.seahorse.nodes.offer.choices?.map((c) => c.text)).toEqual([
      'yes we do',
      'no i actually have not seen any',
    ])
  })

  it('walks the player over before spending one item and playing the white star burst', () => {
    const w = setup(2)
    const mich = w.objects.find((o) => o.id === 'mich')!
    const stayed = { x: mich.x, y: mich.y }
    reach(w, 'seahorse', 'offer')
    expect(mich).toMatchObject(stayed)
    expect(w.player).toMatchObject({ x: 16, y: 17 })
    apply(w, { type: 'interact' }, content)
    expect(w.player.path?.length).toBeGreaterThan(0)
    expect(w.inventory.electrolytes).toBe(2)
    reach(w, 'seahorse', 'given')
    const horse = w.objects.find((o) => o.id === 'seahorse')!
    expect(Math.abs(w.player.x - horse.x) + Math.abs(w.player.y - horse.y)).toBe(1)
    expect(w.typing).toMatchObject({
      text: 'you gave dr. sceantist the horse electrolytes',
      who: '',
    })
    expect(w.inventory.electrolytes).toBe(1)
    expect(w.flags['seahorse:peace']).toBe(true)
    apply(w, { type: 'interact' }, content)
    expect(w.closeup).toMatchObject({ sheet: 'seahorse', burst: null })
    apply(w, { type: 'tick', dt: 1000 }, content)
    expect(w.closeup?.burst).toBe(w.time)
    apply(w, { type: 'tick', dt: 1999 }, content)
    expect(w.typing).toBeUndefined()
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.typing?.text).toBe('mmmm that was delicious.')
    apply(w, { type: 'interact' }, content)
    expect(w.typing?.text).toBe('i have achieved spiritual peace')
    expect(mich).toMatchObject(stayed)
    expect(JSON.parse(JSON.stringify(w)).flags['seahorse:peace']).toBe(true)
  })

  it.each([0, 1])('takes the angry path with %i electrolytes when none are offered', (count) => {
    const w = setup(count)
    const mich = w.objects.find((o) => o.id === 'mich')!
    const stayed = { x: mich.x, y: mich.y }
    reach(w, 'seahorse', count ? 'offer' : 'none')
    if (count) apply(w, { type: 'move', dir: 'down' }, content)
    else expect(w.typing?.text).toBe('no i actually have not seen any')
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('cannon')
    expect(w.inventory.electrolytes).toBe(count)
    expect(w.flags['seahorse:peace']).toBeUndefined()
    expect(mich).toMatchObject(stayed)
    expect(w.player).toMatchObject({ x: 16, y: 17 })
    reach(w, 'cannon', 'rage')
    expect(w.typing?.text).toBe('I CURSED YOU ONCE AND I WILL CURSE YOU AGAIN')
    reach(w, 'cannon', '10')
    expect(w.typing?.text).toBe('lol you missed')
    const before = w.score
    reach(w, 'cannon', 'alsoMissed')
    expect(w.typing?.text).toBe('lol you also missed')
    expect(w.objects.find((o) => o.id === 'cannon2')).toMatchObject({ right: true, y: 15 })
    expect(w.score).toBeLessThan(before)
    apply(w, { type: 'interact' }, content)
    expect(w.typing).toMatchObject({
      who: 'dr. sceantist',
      text: "i guess we're at a stalemate then",
    })
    apply(w, { type: 'interact' }, content)
    apply(w, { type: 'tick', dt: 999 }, content)
    expect(w.typing).toBeUndefined()
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.typing?.text).toBe(
      `thanks guys our beauty is ${w.score} now. couldn't have done it without you`,
    )
    reach(w, 'cannon', 'tired')
    expect(mich).toMatchObject(stayed)
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.key).toBe('tarq')
    expect(w.rumble).toBeGreaterThan(w.time)
    reach(w, 'tarq', '5')
    expect(w.objects.some((o) => o.id === 'tarq')).toBe(true)
  })

  it('keeps the peaceful horse from retaliating and thanks only Etarp', () => {
    const w = setup(1)
    reach(w, 'seahorse', 'offer')
    reach(w, 'cannon', '8c')
    apply(w, { type: 'move', dir: 'up' }, content)
    apply(w, { type: 'tick', dt: 250 }, content)
    apply(w, { type: 'move', dir: null }, content)
    apply(w, { type: 'tick', dt: 16 }, content)
    expect(w.dialogue?.node).toBe('9')
    reach(w, 'cannon', '10')
    expect(w.flags['seahorse:peace']).toBe(true)
    expect(w.inventory.electrolytes).toBeUndefined()
    expect(w.closeup).toBeNull()
    const before = w.score
    reach(w, 'cannon', 'thanksEtarp')
    expect(w.typing?.text).toBe(
      `thanks etarp our beauty is ${w.score} now. couldn't have done it without you`,
    )
    expect(w.score).toBe(before)
    expect(w.objects.some((o) => o.id === 'cannon2')).toBe(false)
    // The existing departure must not undo the peace while the new ending is still to come.
    w.dialogue = { key: 'tarq', node: 'yarr', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('off0')
    expect(w.objects.some((o) => o.id === 'cannon2')).toBe(false)
  })
})
