import { describe, it, expect } from 'vitest'
import { initialState, step } from './dive'
import { coreConnected, MULT_PER_CONNECTED_NODE, connectedMultiplier } from './network'
import { income } from './economy'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clone initialState and set arbitrary zones to owner:'you' */
function stateOwning(ids: string[]) {
  const s = initialState()
  return {
    ...s,
    map: {
      ...s.map,
      zones: s.map.zones.map(z =>
        ids.includes(z.id) ? { ...z, owner: 'you' as const } : z,
      ),
    },
  }
}

// ─── coreConnected() ─────────────────────────────────────────────────────────

describe('coreConnected()', () => {
  it('only entry owned → core set is {entry}', () => {
    const s = initialState() // entry is owned by 'you' at start
    const cc = coreConnected(s)
    expect(cc).toEqual(new Set(['entry']))
  })

  it('entry + vessel_a both owned → both in core set', () => {
    const s = stateOwning(['entry', 'vessel_a'])
    const cc = coreConnected(s)
    expect(cc.has('entry')).toBe(true)
    expect(cc.has('vessel_a')).toBe(true)
  })

  it('entry + vessel_a + vessel_c all owned → all three in core set', () => {
    const s = stateOwning(['entry', 'vessel_a', 'vessel_c'])
    const cc = coreConnected(s)
    expect(cc).toEqual(new Set(['entry', 'vessel_a', 'vessel_c']))
  })

  it('vessel_b owned but not entry → vessel_b is NOT in core set (not reachable from entry without you-owned chain)', () => {
    // initialState owns 'entry', we add vessel_b.
    // vessel_b is adjacent to entry — but entry IS owned, so vessel_b is reachable
    // via: entry (you) → vessel_b (you). Both should be in core set.
    const s = stateOwning(['entry', 'vessel_b'])
    const cc = coreConnected(s)
    expect(cc.has('vessel_b')).toBe(true)
  })

  it('a you-owned zone with no path of owned nodes back to entry is NOT in core set', () => {
    // organ is adjacent to vessel_a and vessel_b but neither is owned in this state
    const s = stateOwning(['entry', 'organ'])
    // entry <-> vessel_a (open) and entry <-> vessel_b (open), vessel_b <-> organ (open)
    // but vessel_a and vessel_b are NOT owned, so organ cannot be reached from entry
    // through owned nodes
    const cc = coreConnected(s)
    expect(cc.has('organ')).toBe(false)
  })

  it('barrier edges block connectivity even if both endpoints are owned', () => {
    // vessel_b <-> gland is a barrier edge
    const s = stateOwning(['entry', 'vessel_b', 'gland'])
    const cc = coreConnected(s)
    expect(cc.has('gland')).toBe(false)
  })

  it('opened barrier edge (barrier:false) allows connectivity', () => {
    // Same as above but open the barrier
    const s = stateOwning(['entry', 'vessel_b', 'gland'])
    const openedState = {
      ...s,
      map: {
        ...s.map,
        edges: s.map.edges.map(e =>
          (e.from === 'vessel_b' && e.to === 'gland') ||
          (e.from === 'gland' && e.to === 'vessel_b')
            ? { ...e, barrier: false }
            : e,
        ),
      },
    }
    const cc = coreConnected(openedState)
    expect(cc.has('gland')).toBe(true)
  })

  it('none owned → empty core set', () => {
    const s = initialState()
    // Override entry to not be owned
    const noOwned = {
      ...s,
      map: {
        ...s.map,
        zones: s.map.zones.map(z => ({ ...z, owner: 'none' as const })),
      },
    }
    const cc = coreConnected(noOwned)
    expect(cc.size).toBe(0)
  })
})

// ─── connectedMultiplier() ────────────────────────────────────────────────────

describe('connectedMultiplier()', () => {
  it('n=1 (only entry) → multiplier = 1.0 (no bonus)', () => {
    expect(connectedMultiplier(1)).toBe(1)
  })

  it('n=2 → multiplier = 1 + MULT_PER_CONNECTED_NODE × 1', () => {
    expect(connectedMultiplier(2)).toBeCloseTo(1 + MULT_PER_CONNECTED_NODE)
  })

  it('n=4 → multiplier = 1 + MULT_PER_CONNECTED_NODE × 3', () => {
    expect(connectedMultiplier(4)).toBeCloseTo(1 + MULT_PER_CONNECTED_NODE * 3)
  })

  it('multiplier strictly increases with connected size', () => {
    expect(connectedMultiplier(3)).toBeGreaterThan(connectedMultiplier(2))
    expect(connectedMultiplier(5)).toBeGreaterThan(connectedMultiplier(3))
  })
})

// ─── income() with connectivity ───────────────────────────────────────────────

describe('income() connectivity multiplier', () => {
  it('(a) fully-connected network earns more than same count of isolated owned nodes', () => {
    // Scenario A: entry + vessel_a + vessel_b — all connected
    const connected = stateOwning(['entry', 'vessel_a', 'vessel_b'])
    const incomeConnected = income(connected)

    // Scenario B: three owned nodes but the inner ones aren't linked to entry
    // (organ is adjacent to vessel_a/vessel_b but those aren't owned — organ is isolated)
    // We need 3 owned nodes where 2 are NOT core-connected.
    // Use: entry (connected) + organ (isolated, no owned path) + organ_b (isolated)
    const isolated = stateOwning(['entry', 'organ', 'organ_b'])
    const incomeIsolated = income(isolated)

    expect(incomeConnected).toBeGreaterThan(incomeIsolated)
  })

  it('(b) multiplier scales with connected size: 4-node chain earns more than 2-node chain', () => {
    // 2 connected nodes
    const small = stateOwning(['entry', 'vessel_a'])
    const incSmall = income(small)

    // 4 connected nodes: entry → vessel_a → vessel_c + entry → vessel_b
    const large = stateOwning(['entry', 'vessel_a', 'vessel_b', 'vessel_c'])
    const incLarge = income(large)

    expect(incLarge).toBeGreaterThan(incSmall)
  })

  it('(c) an owned node not connected to entry earns only base rate', () => {
    // organ_b is only reachable via vessel_d, which is not owned
    const s = stateOwning(['entry', 'organ_b'])
    const cc = coreConnected(s)
    expect(cc.has('organ_b')).toBe(false)

    // Income should be: entry earns multiplier(1)×base, organ_b earns base only
    // entry is the only core-connected node → multiplier(1) = 1
    // Total = 1×1 + 1 = 2
    const inc = income(s)
    expect(inc).toBe(2)
  })

  it('(d) clearing vessel_a (chokepoint) drops its linked nodes from multiplied to base', () => {
    // Set up: entry, vessel_a, vessel_c, organ all owned (all connected via vessel_a)
    const s = stateOwning(['entry', 'vessel_a', 'vessel_c', 'organ'])
    const incomeBefore = income(s)

    // Now clear vessel_a (immune system reclaims it)
    const afterLoss = {
      ...s,
      map: {
        ...s.map,
        zones: s.map.zones.map(z =>
          z.id === 'vessel_a' ? { ...z, owner: 'none' as const } : z,
        ),
      },
    }
    const incomeAfter = income(afterLoss)

    // Before: 4 connected nodes → multiplier(4) × 4 base units
    // After: only entry is connected (vessel_c and organ lose their path); vessel_c and organ earn base only
    // entry earns multiplier(1)×1; vessel_c earns 1; organ earns 1 → total = 3
    expect(incomeBefore).toBeGreaterThan(incomeAfter)

    // Specifically: entry connected (n=1, mult=1), vessel_c isolated (1), organ isolated (1) → total=3
    expect(incomeAfter).toBe(3)
  })
})

// ─── step() integration ───────────────────────────────────────────────────────

describe('step() income reflects connectivity', () => {
  it('step accumulates multiplied income when nodes are connected', () => {
    const s0 = stateOwning(['entry', 'vessel_a', 'vessel_b'])
    const s1 = step(s0, [])
    // 3 connected nodes → multiplier(3) = 1 + 0.25×2 = 1.5
    // income = 1.5 × 3 = 4.5
    const expectedIncome = connectedMultiplier(3) * 3
    expect(s1.biomass).toBeCloseTo(s0.biomass + expectedIncome)
  })

  it('step remains pure with connectivity — two calls give identical results', () => {
    const s0 = stateOwning(['entry', 'vessel_a', 'vessel_b', 'vessel_c'])
    const a = step(s0, [])
    const b = step(s0, [])
    expect(a.biomass).toBe(b.biomass)
  })
})
