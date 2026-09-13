import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply } from './actions'
import { tileIndex, createWorld, npc, tileAt, type Content, type Dialogue } from './world'

const flower: Dialogue = JSON.parse(
  readFileSync(new URL('../../assets/dialogue/flower.json', import.meta.url), 'utf8'),
)
const content: Content = { dialogues: { flower }, items: {} }

describe('the revised introduction dialogue', () => {
  it('turns Mich toward the boat for the insult and back right for the orb line', () => {
    const landing: Dialogue = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/landing.json', import.meta.url), 'utf8'),
    )
    const c: Content = { dialogues: { landing }, items: {} }
    const w = createWorld()
    const mich = w.objects.find((o) => o.id === 'mich')!
    apply(w, { type: 'talk', key: 'landing' }, c)
    apply(w, { type: 'interact' }, c)
    expect(mich).toMatchObject({ facing: 'right' })
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.node).toBe('3')
    expect(mich).toMatchObject({ x: 13, y: 17, facing: 'up' })
    apply(w, { type: 'interact' }, c)
    expect(mich).toMatchObject({ facing: 'up' })
    apply(w, { type: 'interact' }, c)
    expect(w.dialogue?.node).toBe('5')
    expect(mich).toMatchObject({ x: 13, y: 17, facing: 'right' })
  })

  it('brings the player back to the second island before Mich plants after the mimic encounter', () => {
    const w = createWorld()
    for (let x = 20; x < 32; x++)
      if (tileAt(w, x, 17) === 'water') w.tiles[tileIndex(w, x, 17)] = 'salt'
    Object.assign(w.player, { x: 32, y: 17 })
    const mich = w.objects.find((o) => o.id === 'mich')!
    Object.assign(mich, { x: 23, y: 16 })
    w.flags['fired:mimic'] = true
    w.dialogue = { key: 'flower', node: '5', choice: 0 }
    apply(w, { type: 'interact' }, content)
    for (let i = 0; i < 400 && w.dialogue?.node === '6'; i++)
      apply(w, { type: 'tick', dt: 50 }, content)
    expect(mich).toMatchObject({ x: 18, y: 15, facing: 'right' })
    for (const [who, text] of [
      ['', 'i actually cannot see what you are doing, you walked off screen'],
      [undefined, 'ok walk over here then'],
      ['', 'fine'],
    ]) {
      expect(flower.nodes[w.dialogue!.node].text).toBe(text)
      expect(flower.nodes[w.dialogue!.node].who).toBe(who)
      expect(w.objects.some((o) => o.id === 'flower1')).toBe(false)
      expect(w.player).toMatchObject({ x: 32, y: 17, step: null })
      apply(w, { type: 'interact' }, content)
    }
    expect(w.player.path?.length).toBeGreaterThan(0)
    for (let i = 0; i < 400 && !w.objects.some((o) => o.id === 'flower1'); i++) {
      apply(w, { type: 'tick', dt: 50 }, content)
      expect(tileAt(w, w.player.x, w.player.y)).not.toBe('water')
      if (w.player.step) expect(tileAt(w, w.player.step.x, w.player.step.y)).not.toBe('water')
    }
    expect(w.player).toMatchObject({ x: 23, y: 16, facing: 'left', step: null })
    expect(w.objects.find((o) => o.id === 'flower1')).toMatchObject({ x: 18, y: 14 })
    apply(w, { type: 'tick', dt: 299 }, content)
    expect(w.dialogue?.node).toBe('7')
    expect(w.typing).toBeUndefined()
    apply(w, { type: 'confirm' }, content)
    expect(w.dialogue?.node).toBe('7')
    apply(w, { type: 'tick', dt: 1 }, content)
    expect(w.dialogue?.node).toBe('8')
  })

  it('plants directly when the chest was opened on the second island', () => {
    const w = createWorld()
    for (let x = 20; x < 23; x++) w.tiles[tileIndex(w, x, 17)] = 'salt'
    Object.assign(w.player, { x: 24, y: 16 })
    Object.assign(
      w.objects.find((o) => o.id === 'mich')!,
      { x: 23, y: 16 },
    )
    w.dialogue = { key: 'flower', node: '5', choice: 0 }
    apply(w, { type: 'interact' }, content)
    for (let i = 0; i < 400 && w.dialogue?.node === '6'; i++)
      apply(w, { type: 'tick', dt: 50 }, content)
    expect(w.objects.find((o) => o.id === 'flower1')).toMatchObject({ x: 18, y: 14 })
    expect(w.player).toMatchObject({ x: 24, y: 16, step: null })
    expect(w.player.path).toBeUndefined()
  })

  it('keeps Mich’s wow inside Walter’s close-up', () => {
    const w = createWorld()
    w.dialogue = { key: 'flower', node: '20c', choice: 0 }
    w.closeup = { sheet: 'walter', frame: 1, frames: 1, at: 0, since: 0, burst: 0 }
    apply(w, { type: 'interact' }, content)
    expect(flower.nodes[w.dialogue!.node].text).toBe('wow')
    expect(w.closeup?.down).toBeUndefined()
    apply(w, { type: 'interact' }, content)
    expect(w.closeup?.down).toBe(0)
  })

  it('puts yes you can before Mich’s definition and removes the unwanted exchanges', () => {
    const w = createWorld()
    w.dialogue = { key: 'flower', node: '22', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(flower.nodes[w.dialogue!.node]).toMatchObject({ who: 'Walter', text: 'yes you can' })
    apply(w, { type: 'interact' }, content)
    expect(w.dialogue?.node).toBe('22b')
    const lines = Object.values(flower.nodes).map((n) => n.text ?? '')
    expect(lines.some((s) => /fix our boat with beauty|shipwreck look nicer|ok nerd/.test(s))).toBe(
      false,
    )
    const landing = JSON.parse(
      readFileSync(new URL('../../assets/dialogue/landing.json', import.meta.url), 'utf8'),
    )
    expect(landing.nodes['3'].text).toBe('you bumbling idiot. you buffoon.')
  })

  it.each([false, true])('Mich watches the boat, or answers Walter when tree gone: %s', (gone) => {
    const w = createWorld()
    w.objects = w.objects.filter((o) => o.id !== 'orb1' && (!gone || o.id !== 'tree1'))
    const mich = w.objects.find((o) => o.id === 'mich')!
    Object.assign(mich, { x: 18, y: 15 })
    w.objects.push(npc('walter', 'walter', 24, 14, 'down', 'walter'))
    w.flags['tree:gone'] = gone
    Object.assign(w.player, { x: 24, y: 16 })
    w.dialogue = { key: 'flower', node: 'chill', choice: 0 }
    apply(w, { type: 'interact' }, content)
    expect(flower.nodes[w.dialogue!.node].text).toBe('im gonna stare at the hole in our boat')
    for (let i = 0; i < 600 && w.dialogue; i++) {
      if (flower.nodes[w.dialogue.node].text !== undefined) apply(w, { type: 'interact' }, content)
      apply(w, { type: 'tick', dt: 50 }, content)
    }
    expect(w.dialogue).toBeNull()
    expect(mich).toMatchObject({ x: 14, y: 16, facing: gone ? 'right' : 'left' })
    expect(w.objects.find((o) => o.id === 'walter')?.x).toBe(gone ? 18 : 17)
  })
})
