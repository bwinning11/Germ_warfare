import { describe, it, expect } from 'vitest'
import { initialState, step, COLONIZE_TICKS } from './dive'
import { neighbors } from './map'
import type { ColonizeOrder } from './types'

// Helper: run N ticks with the same orders each tick
function runTicks(state: ReturnType<typeof initialState>, orders: ColonizeOrder[], n: number) {
  let s = state
  for (let i = 0; i < n; i++) {
    s = step(s, orders)
  }
  return s
}

function zoneOwner(state: ReturnType<typeof initialState>, id: string) {
  return state.map.zones.find(z => z.id === id)?.owner
}

function zoneInfection(state: ReturnType<typeof initialState>, id: string) {
  return state.map.zones.find(z => z.id === id)?.infection ?? -1
}

describe('colonize order — valid target (non-barrier neighbor)', () => {
  it('vessel_a is adjacent to entry via non-barrier edge', () => {
    // Sanity check the map
    const s = initialState()
    const ns = neighbors(s.map, 'entry') as Array<{ id: string; barrier: boolean }>
    const vesselA = ns.find(n => n.id === 'vessel_a')
    expect(vesselA).toBeDefined()
    expect(vesselA!.barrier).toBe(false)
  })

  it('infection increases each tick toward the target', () => {
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'vessel_a' }
    const s1 = step(s0, [order])
    expect(zoneInfection(s1, 'vessel_a')).toBeGreaterThan(0)
  })

  it(`flips ownership to "you" after exactly COLONIZE_TICKS ticks`, () => {
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'vessel_a' }
    const final = runTicks(s0, [order], COLONIZE_TICKS)
    expect(zoneOwner(final, 'vessel_a')).toBe('you')
  })

  it('does not flip ownership before COLONIZE_TICKS ticks', () => {
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'vessel_a' }
    const early = runTicks(s0, [order], COLONIZE_TICKS - 1)
    expect(zoneOwner(early, 'vessel_a')).toBe('none')
  })

  it('colonized zone resets infection to 0 after flip', () => {
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'vessel_a' }
    const final = runTicks(s0, [order], COLONIZE_TICKS)
    expect(zoneInfection(final, 'vessel_a')).toBe(0)
  })
})

describe('colonize order — rejected targets', () => {
  it('colonize on a non-adjacent zone is a no-op (organ not adjacent to entry)', () => {
    // organ is not a direct neighbor of entry
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'organ' }
    const s1 = step(s0, [order])
    expect(zoneOwner(s1, 'organ')).toBe('none')
    expect(zoneInfection(s1, 'organ')).toBe(0)
  })

  it('colonize on gland is rejected even after many ticks (barrier edge)', () => {
    // gland is only reachable from vessel_b via a barrier edge.
    // even if we hold vessel_b, the barrier blocks colonize.
    const s0 = initialState()
    // Give the player vessel_b ownership manually
    const modState = {
      ...s0,
      map: {
        ...s0.map,
        zones: s0.map.zones.map(z =>
          z.id === 'vessel_b' ? { ...z, owner: 'you' as const } : z,
        ),
      },
    }
    const order: ColonizeOrder = { type: 'colonize', target: 'gland' }
    const final = runTicks(modState, [order], COLONIZE_TICKS + 5)
    expect(zoneOwner(final, 'gland')).toBe('none')
    expect(zoneInfection(final, 'gland')).toBe(0)
  })

  it('colonize on a zone already owned by you is a no-op', () => {
    const s0 = initialState()
    const order: ColonizeOrder = { type: 'colonize', target: 'entry' }
    const s1 = step(s0, [order])
    // entry stays 'you', infection stays 0
    expect(zoneOwner(s1, 'entry')).toBe('you')
    expect(zoneInfection(s1, 'entry')).toBe(0)
  })
})

describe('step() purity with colonize orders', () => {
  it('does not mutate the input state', () => {
    const s0 = initialState()
    const originalInfection = s0.map.zones.find(z => z.id === 'vessel_a')!.infection
    const order: ColonizeOrder = { type: 'colonize', target: 'vessel_a' }
    step(s0, [order])
    expect(s0.map.zones.find(z => z.id === 'vessel_a')!.infection).toBe(originalInfection)
  })
})
