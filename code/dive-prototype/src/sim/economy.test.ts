import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'
import { spend } from './economy'
import { connectedMultiplier } from './network'

describe('biomass income', () => {
  it('initialState has biomass 0', () => {
    const s = initialState()
    expect(s.biomass).toBe(0)
  })

  it('entry zone starts as owner "you"', () => {
    const s = initialState()
    const entry = s.map.zones.find(z => z.id === 'entry')
    expect(entry?.owner).toBe('you')
  })

  it('earns +1 biomass per you-owned zone per tick (1 zone held at start)', () => {
    const s0 = initialState()
    // entry is owned by 'you', so income = 1 per tick
    const s1 = step(s0, [])
    expect(s1.biomass).toBe(1)
  })

  it('earns more biomass when N connected zones are held (connectivity multiplier applies)', () => {
    // Manually set up a state with 3 zones owned — all connected to entry via open edges
    const s0 = initialState()
    const modState = {
      ...s0,
      map: {
        ...s0.map,
        zones: s0.map.zones.map(z =>
          z.id === 'vessel_a' || z.id === 'vessel_b'
            ? { ...z, owner: 'you' as const }
            : z,
        ),
      },
    }
    // Now entry + vessel_a + vessel_b = 3 zones, all core-connected
    // multiplier(3) = 1 + 0.25×2 = 1.5; income = 1.5 × 3 = 4.5
    const s1 = step(modState, [])
    const expectedIncome = connectedMultiplier(3) * 3
    expect(s1.biomass).toBeCloseTo(expectedIncome)
    expect(s1.biomass).toBeGreaterThan(3) // strictly more than flat rate
  })
})

describe('spend()', () => {
  it('deducts biomass and returns new state', () => {
    const s0 = { ...initialState(), biomass: 5 }
    const s1 = spend(s0, 3)
    expect(s1).not.toBeNull()
    expect(s1!.biomass).toBe(2)
  })

  it('returns null when biomass is insufficient', () => {
    const s0 = { ...initialState(), biomass: 2 }
    const result = spend(s0, 3)
    expect(result).toBeNull()
  })

  it('returns null when biomass is exactly 0 and cost > 0', () => {
    const s0 = { ...initialState(), biomass: 0 }
    expect(spend(s0, 1)).toBeNull()
  })

  it('allows spend when biomass equals cost exactly', () => {
    const s0 = { ...initialState(), biomass: 3 }
    const s1 = spend(s0, 3)
    expect(s1).not.toBeNull()
    expect(s1!.biomass).toBe(0)
  })

  it('does not mutate the original state', () => {
    const s0 = { ...initialState(), biomass: 5 }
    spend(s0, 3)
    expect(s0.biomass).toBe(5)
  })
})
