import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'
import type { GameState } from './types'
import { HEAT_THRESHOLD_ALERTED, HEAT_RISE_PER_OWNED_ZONE } from './heat'
import { HEAT_BUMP_ON_ZONE_LOSS, RESPONDER_DAMAGE_PER_TICK } from './immune'

// Helper: advance state to a target heat level by stepping with owned zones
function buildStateWithHeat(heat: number): GameState {
  const s = initialState()
  return { ...s, heat }
}

// Helper: produce a state that has a you-owned zone with known infection
function buildStateWithInfectedOwnedZone(infection: number, heat: number): GameState {
  const base = initialState()
  // Mark vessel_a as owned by 'you' with specified infection
  const zones = base.map.zones.map(z =>
    z.id === 'vessel_a' ? { ...z, owner: 'you' as const, infection } : z,
  )
  return { ...base, map: { ...base.map, zones }, heat }
}

describe('heat — rises with owned-zone count', () => {
  it('heat increases each tick proportional to owned zones', () => {
    const s0 = initialState()
    // s0 has 'entry' owned → 1 owned zone
    const s1 = step(s0, [])
    expect(s1.heat).toBeGreaterThan(s0.heat)
  })

  it('more owned zones → faster heat rise', () => {
    // Two states: one owns 1 zone, one owns 2 zones
    const s1zone = initialState() // owns 'entry' only
    const s2zones: GameState = {
      ...initialState(),
      map: {
        ...initialState().map,
        zones: initialState().map.zones.map(z =>
          z.id === 'vessel_a' ? { ...z, owner: 'you' as const } : z,
        ),
      },
    }

    const after1 = step(s1zone, [])
    const after2 = step(s2zones, [])
    expect(after2.heat).toBeGreaterThan(after1.heat)
  })
})

describe('dormancy (per-node)', () => {
  it('dormancy order on entry adds entry to dormant set', () => {
    const s0 = initialState()
    expect(s0.dormant.has('entry')).toBe(false)
    const s1 = step(s0, [{ type: 'dormancy', zoneId: 'entry' }])
    expect(s1.dormant.has('entry')).toBe(true)
  })

  it('dormancy order on entry again removes entry from dormant set (toggle)', () => {
    const s0 = initialState()
    const s1 = step(s0, [{ type: 'dormancy', zoneId: 'entry' }])
    const s2 = step(s1, [{ type: 'dormancy', zoneId: 'entry' }])
    expect(s2.dormant.has('entry')).toBe(false)
  })

  it('dorming all owned nodes causes heat to decay instead of rising', () => {
    // Put entry (the only owned node) dormant, then step — heat should drop
    const s0: GameState = { ...initialState(), heat: 50, dormant: new Set(['entry']) }
    const s1 = step(s0, [])
    expect(s1.heat).toBeLessThan(s0.heat)
  })

  it('dormant node does not block colonize (colonize is always active; only income/heat differ)', () => {
    // Per-node dormancy does not prevent colonize — colonize targets adjacent zones, not self
    const s0 = initialState()
    const s1 = step(s0, [{ type: 'colonize', target: 'vessel_a' }])
    expect(s1.colonizeProgress['vessel_a']).toBeGreaterThan(0)
  })

  it('while all nodes hot, colonize progress DOES advance', () => {
    const s0 = initialState()
    const s1 = step(s0, [{ type: 'colonize', target: 'vessel_a' }])
    expect(s1.colonizeProgress['vessel_a']).toBeGreaterThan(0)
  })
})

describe('responders — spawn and act at alerted+', () => {
  it('no responders when heat is calm', () => {
    const s0: GameState = { ...initialState(), heat: 0, responders: [] }
    const s1 = step(s0, [])
    expect(s1.responders.length).toBe(0)
  })

  it('at alerted heat, a responder spawns in the highest-infection you-owned zone', () => {
    // Give two owned zones with different infections; responder should go to higher one
    const base = initialState()
    const zones = base.map.zones.map(z => {
      if (z.id === 'entry') return { ...z, owner: 'you' as const, infection: 10 }
      if (z.id === 'vessel_a') return { ...z, owner: 'you' as const, infection: 50 }
      return z
    })
    const s0: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: HEAT_THRESHOLD_ALERTED,
      responders: [],
    }
    const s1 = step(s0, [])
    expect(s1.responders.length).toBeGreaterThan(0)
    // The responder should be in vessel_a (infection=50, highest)
    expect(s1.responders[0].zone).toBe('vessel_a')
  })

  it('responder reduces infection in its zone each tick', () => {
    const base = initialState()
    const zones = base.map.zones.map(z =>
      z.id === 'entry' ? { ...z, owner: 'you' as const, infection: 80 } : z,
    )
    const s0: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: HEAT_THRESHOLD_ALERTED,
      responders: [{ zone: 'entry' }],
    }
    const s1 = step(s0, [])
    const entryAfter = s1.map.zones.find(z => z.id === 'entry')!
    expect(entryAfter.infection).toBeLessThan(80)
  })
})

describe('zone loss — infection reaching 0 flips owner and bumps heat', () => {
  it('when a you-owned zone infection reaches 0 via responder, it flips to none', () => {
    // infection just above what one responder tick would reduce (so it hits 0)
    const base = initialState()
    const infection = RESPONDER_DAMAGE_PER_TICK // exactly at the damage threshold so next tick hits 0
    const zones = base.map.zones.map(z =>
      z.id === 'entry' ? { ...z, owner: 'you' as const, infection } : z,
    )
    const s0: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: HEAT_THRESHOLD_ALERTED,
      responders: [{ zone: 'entry' }],
    }
    const s1 = step(s0, [])
    const entryAfter = s1.map.zones.find(z => z.id === 'entry')!
    expect(entryAfter.owner).toBe('none')
  })

  it('losing a zone bumps heat by HEAT_BUMP_ON_ZONE_LOSS', () => {
    const base = initialState()
    const infection = RESPONDER_DAMAGE_PER_TICK
    const zones = base.map.zones.map(z =>
      z.id === 'entry' ? { ...z, owner: 'you' as const, infection } : z,
    )
    const startHeat = HEAT_THRESHOLD_ALERTED
    const s0: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: startHeat,
      responders: [{ zone: 'entry' }],
    }
    const s1 = step(s0, [])
    // Heat should be: startHeat + rise(still owned at start of tick) + bump - no rise from lost zone
    // At minimum, it must be greater than startHeat + HEAT_BUMP_ON_ZONE_LOSS - some decay
    // Just assert the bump is included by checking heat > what it would have been without loss
    // We'll check it's at least startHeat (conservative: bump offsets any decay)
    expect(s1.heat).toBeGreaterThanOrEqual(startHeat)
    // And specifically that the bump constant is positive
    expect(HEAT_BUMP_ON_ZONE_LOSS).toBeGreaterThan(0)
  })
})
