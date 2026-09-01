import { describe, expect, it } from 'vitest'
import { createWorld, tileAt } from './world'

describe('createWorld', () => {
  it('builds a 5x5 island at 14..18: sand ring, grass centre, water elsewhere', () => {
    const w = createWorld()
    expect(tileAt(w, 14, 14)).toBe('sand')
    expect(tileAt(w, 18, 18)).toBe('sand')
    expect(tileAt(w, 16, 14)).toBe('sand')
    expect(tileAt(w, 14, 16)).toBe('sand')
    expect(tileAt(w, 16, 16)).toBe('grass')
    expect(tileAt(w, 15, 17)).toBe('grass')
    expect(tileAt(w, 13, 16)).toBe('water')
    expect(tileAt(w, 19, 16)).toBe('water')
    expect(w.tiles.filter((t) => t !== 'water')).toHaveLength(25)
  })
})

describe('tileAt', () => {
  it('is undefined outside the map', () => {
    const w = createWorld()
    expect(tileAt(w, -1, 16)).toBeUndefined()
    expect(tileAt(w, 16, -1)).toBeUndefined()
    expect(tileAt(w, w.width, 16)).toBeUndefined()
    expect(tileAt(w, 16, w.height)).toBeUndefined()
  })
})
