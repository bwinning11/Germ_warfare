import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'
import { BREACH_TICKS } from './breach'
import type { BreachOrder, ColonizeOrder } from './types'

// Helper: build a state where vessel_b is owned (so the barrier edge to gland is accessible)
function stateWithVesselBOwned() {
  const s = initialState()
  return {
    ...s,
    map: {
      ...s.map,
      zones: s.map.zones.map(z =>
        z.id === 'vessel_b' ? { ...z, owner: 'you' as const } : z,
      ),
    },
  }
}

// Helper: run N ticks with the same orders
function runTicks(
  state: ReturnType<typeof initialState>,
  orders: (BreachOrder | ColonizeOrder)[],
  n: number,
) {
  let s = state
  for (let i = 0; i < n; i++) {
    s = step(s, orders)
  }
  return s
}

function edgeBarrier(state: ReturnType<typeof initialState>, from: string, to: string) {
  return state.map.edges.find(e => e.from === from && e.to === to)?.barrier
}

function zoneOwner(state: ReturnType<typeof initialState>, id: string) {
  return state.map.zones.find(z => z.id === id)?.owner
}

describe('breach order — type shape', () => {
  it('BreachOrder has type "breach" and a target ZoneId', () => {
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    expect(order.type).toBe('breach')
    expect(order.target).toBe('gland')
  })
})

describe('BREACH_TICKS constant', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(BREACH_TICKS)).toBe(true)
    expect(BREACH_TICKS).toBeGreaterThan(0)
  })
})

describe('breach order — rejected before BREACH_TICKS', () => {
  it('barrier remains true after BREACH_TICKS-1 ticks', () => {
    const s = stateWithVesselBOwned()
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    const after = runTicks(s, [order], BREACH_TICKS - 1)
    // barrier should still be true on the vessel_b→gland edge
    expect(edgeBarrier(after, 'vessel_b', 'gland')).toBe(true)
    expect(edgeBarrier(after, 'gland', 'vessel_b')).toBe(true)
  })
})

describe('breach order — clears barrier after BREACH_TICKS', () => {
  it('barrier is false on vessel_b→gland after BREACH_TICKS ticks', () => {
    const s = stateWithVesselBOwned()
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    const after = runTicks(s, [order], BREACH_TICKS)
    expect(edgeBarrier(after, 'vessel_b', 'gland')).toBe(false)
    expect(edgeBarrier(after, 'gland', 'vessel_b')).toBe(false)
  })

  it('breachProgress is cleared after the barrier opens', () => {
    const s = stateWithVesselBOwned()
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    const after = runTicks(s, [order], BREACH_TICKS)
    expect(after.breachProgress['gland'] ?? 0).toBe(0)
  })
})

describe('breach order — invalid if no owned zone borders the barrier edge', () => {
  it('breach order toward gland is ignored if vessel_b is not owned', () => {
    // entry is owned; entry has no barrier edge to gland → breach is invalid
    const s = initialState()
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    const after = runTicks(s, [order], BREACH_TICKS + 5)
    // barrier should remain; gland stays unowned
    expect(edgeBarrier(after, 'vessel_b', 'gland')).toBe(true)
  })
})

describe('colonize toward gland — blocked before breach, allowed after', () => {
  it('colonize gland is rejected while barrier is intact', () => {
    const s = stateWithVesselBOwned()
    const order: ColonizeOrder = { type: 'colonize', target: 'gland' }
    // Run many ticks — should never flip
    const after = runTicks(s, [order], BREACH_TICKS + 5)
    expect(zoneOwner(after, 'gland')).toBe('none')
  })

  it('colonize gland succeeds after breach clears the barrier', () => {
    const s = stateWithVesselBOwned()
    const breachOrder: BreachOrder = { type: 'breach', target: 'gland' }

    // First, breach the barrier
    const breached = runTicks(s, [breachOrder], BREACH_TICKS)
    expect(edgeBarrier(breached, 'vessel_b', 'gland')).toBe(false)

    // Now colonize gland — barrier is gone, so it should succeed
    const colonizeOrder: ColonizeOrder = { type: 'colonize', target: 'gland' }
    // Need to also keep vessel_b owned across ticks (it won't be displaced)
    const colonized = runTicks(breached, [colonizeOrder], 10)
    expect(zoneOwner(colonized, 'gland')).toBe('you')
  })
})

describe('breach halts while dormant', () => {
  it('breach progress does not advance while dormant', () => {
    const s = stateWithVesselBOwned()
    // Toggle dormancy on
    const dormantState = step(s, [{ type: 'dormancy' }])
    expect(dormantState.dormant).toBe(true)

    const breachOrder: BreachOrder = { type: 'breach', target: 'gland' }
    const after = runTicks(dormantState, [breachOrder], BREACH_TICKS + 5)
    // Barrier should remain intact — no progress while dormant
    expect(edgeBarrier(after, 'vessel_b', 'gland')).toBe(true)
  })
})

describe('step() purity with breach orders', () => {
  it('does not mutate the input state', () => {
    const s = stateWithVesselBOwned()
    const originalBarrier = edgeBarrier(s, 'vessel_b', 'gland')
    const order: BreachOrder = { type: 'breach', target: 'gland' }
    step(s, [order])
    // original state must be unchanged
    expect(edgeBarrier(s, 'vessel_b', 'gland')).toBe(originalBarrier)
  })
})
