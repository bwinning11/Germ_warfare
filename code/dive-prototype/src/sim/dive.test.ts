import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'

describe('step()', () => {
  it('increments tick by 1', () => {
    const s0 = initialState()
    const s1 = step(s0, [])
    expect(s1.tick).toBe(s0.tick + 1)
  })

  it('is pure — does not mutate input state', () => {
    const s0 = initialState()
    const originalTick = s0.tick
    step(s0, [])
    expect(s0.tick).toBe(originalTick)
  })

  it('is deterministic — two calls on the same input return deep-equal results', () => {
    const s0 = initialState()
    const a = step(s0, [])
    const b = step(s0, [])
    expect(a).toEqual(b)
  })

  it('preserves the map reference shape (zones + edges intact)', () => {
    const s0 = initialState()
    const s1 = step(s0, [])
    expect(s1.map.zones.length).toBe(s0.map.zones.length)
    expect(s1.map.edges.length).toBe(s0.map.edges.length)
  })
})
