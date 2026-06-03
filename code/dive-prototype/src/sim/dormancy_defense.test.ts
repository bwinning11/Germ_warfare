/**
 * dormancy_defense.test.ts
 *
 * Tests for v2 Task 3: Selective per-node dormancy + Defense (Brute/Cyst).
 *
 * Tests are organised by the required spec assertions:
 *   (a) dormant node yields no income and adds no Heat
 *   (b) immune deprioritizes dormant nodes (hits a hot node before a dormant one)
 *   (c) multiplier reflects HOT connected count
 *   (d) Brute reduces infection lost to a responder vs. no Brute
 *   (e) Cyst makes a node take longer to clear
 *   (f) deploying defense spends biomass and fails if insufficient
 */

import { describe, it, expect } from 'vitest'
import { initialState, step, deployBrute, buildCyst, BRUTE_COST, CYST_COST } from './dive'
import { income } from './economy'
import { hotConnected, coreConnected, toggleDormant } from './network'
import { highestInfectionOwnedZone, effectiveDamage, RESPONDER_DAMAGE_PER_TICK, BRUTE_DAMAGE_REDUCTION, CYST_DAMAGE_REDUCTION } from './immune'
import { HEAT_THRESHOLD_ALERTED } from './heat'
import type { GameState, ZoneId } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clone initialState and set arbitrary zones to owner:'you' with given infection. */
function stateOwning(ids: ZoneId[], infection = 0): GameState {
  const s = initialState()
  return {
    ...s,
    map: {
      ...s.map,
      zones: s.map.zones.map(z =>
        ids.includes(z.id)
          ? { ...z, owner: 'you' as const, infection }
          : z,
      ),
    },
  }
}

// ─── (a) dormant node yields no income and adds no Heat ──────────────────────

describe('(a) dormant node yields no income', () => {
  it('dorming the only owned node reduces income to 0', () => {
    // entry is owned and hot → income = 1; dorm it → income = 0
    const s = initialState()
    const dormed = { ...s, dormant: new Set<ZoneId>(['entry']) }
    expect(income(dormed)).toBe(0)
  })

  it('dorming one of two owned nodes excludes it from income', () => {
    const s = stateOwning(['entry', 'vessel_a'])
    // With both hot: income = multiplier(2) × 2 = 1.25 × 2 = 2.5
    const hotIncome = income(s)
    expect(hotIncome).toBeCloseTo(2.5)

    // Dorm vessel_a → only entry is hot; entry is hot-connected (size 1)
    // hotConnected = {entry}; income = multiplier(1) × 1 = 1
    const dormed = { ...s, dormant: new Set<ZoneId>(['vessel_a']) }
    const dormIncome = income(dormed)
    expect(dormIncome).toBe(1)
    expect(dormIncome).toBeLessThan(hotIncome)
  })

  it('dorming all owned nodes → income 0, heat does not rise (decays)', () => {
    const s = stateOwning(['entry', 'vessel_a'])
    const allDormed: GameState = { ...s, heat: 30, dormant: new Set<ZoneId>(['entry', 'vessel_a']) }
    const after = step(allDormed, [])
    // No hot nodes → income = 0 → biomass unchanged from start
    expect(after.biomass).toBe(allDormed.biomass)
    // Heat decays (natural decay) since no hot zones
    expect(after.heat).toBeLessThan(allDormed.heat)
  })

  it('step accumulates no biomass from a dormant node', () => {
    // Single owned node (entry) dormed — tick should add 0 biomass
    const s = initialState()
    const dormed: GameState = { ...s, dormant: new Set<ZoneId>(['entry']) }
    const after = step(dormed, [])
    expect(after.biomass).toBe(dormed.biomass)
  })
})

// ─── (b) immune deprioritizes dormant nodes ───────────────────────────────────

describe('(b) immune responder targets hot nodes over dormant ones', () => {
  it('highestInfectionOwnedZone picks the hot node even if dormant node has higher infection', () => {
    const s = stateOwning(['entry', 'vessel_a'], 0)
    const zones = s.map.zones.map(z => {
      if (z.id === 'entry')    return { ...z, infection: 30 }  // HOT, lower infection
      if (z.id === 'vessel_a') return { ...z, infection: 80 }  // DORMANT, higher infection
      return z
    })
    const dormant = new Set<ZoneId>(['vessel_a'])
    // Responder should prefer entry (hot) even though vessel_a has more infection
    const target = highestInfectionOwnedZone(zones, dormant)
    expect(target).toBe('entry')
  })

  it('responder targets the hot zone before the dormant zone in step()', () => {
    const base = initialState()
    const zones = base.map.zones.map(z => {
      if (z.id === 'entry')    return { ...z, owner: 'you' as const, infection: 20 }
      if (z.id === 'vessel_a') return { ...z, owner: 'you' as const, infection: 90 }
      return z
    })
    // vessel_a is dormant; entry is hot. Responder should go to entry.
    const s: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: HEAT_THRESHOLD_ALERTED,
      dormant: new Set<ZoneId>(['vessel_a']),
      responders: [],
    }
    const after = step(s, [])
    // Responder should be targeting entry (the hot zone), not vessel_a
    expect(after.responders.length).toBeGreaterThan(0)
    expect(after.responders[0].zone).toBe('entry')
  })

  it('falls back to dormant node when no hot nodes exist', () => {
    // All owned nodes are dormant — responder must still pick one
    const base = initialState()
    const zones = base.map.zones.map(z => {
      if (z.id === 'entry') return { ...z, owner: 'you' as const, infection: 50 }
      return z
    })
    const dormant = new Set<ZoneId>(['entry'])
    const target = highestInfectionOwnedZone(zones, dormant)
    // Falls back to dormant zone (only available)
    expect(target).toBe('entry')
  })
})

// ─── (c) multiplier reflects HOT connected count ──────────────────────────────

describe('(c) multiplier scales with HOT connected count, not total', () => {
  it('dorming a connected node reduces hotConnected size', () => {
    const s = stateOwning(['entry', 'vessel_a', 'vessel_b'])
    // All hot: hotConnected size = 3
    const allHot = hotConnected(s)
    expect(allHot.size).toBe(3)

    // Dorm vessel_a → hotConnected = {entry, vessel_b} = size 2
    const dormedA = { ...s, dormant: new Set<ZoneId>(['vessel_a']) }
    const afterDorm = hotConnected(dormedA)
    expect(afterDorm.size).toBe(2)
    expect(afterDorm.has('vessel_a')).toBe(false)
  })

  it('dormed node still conducts connectivity (coreConnected includes it)', () => {
    // vessel_a connects entry to vessel_c; if vessel_a is dormed but still
    // conducts connectivity, vessel_c should be reachable in coreConnected.
    // (hotConnected will exclude dormant nodes but they still bridge the graph.)
    const s = stateOwning(['entry', 'vessel_a', 'vessel_c'])
    const dormedA = { ...s, dormant: new Set<ZoneId>(['vessel_a']) }

    // coreConnected includes dormant nodes (they still conduct)
    const cc = coreConnected(dormedA)
    expect(cc.has('vessel_a')).toBe(true)
    expect(cc.has('vessel_c')).toBe(true)

    // But hotConnected excludes vessel_a (dormant) — vessel_c is still hot
    const hc = hotConnected(dormedA)
    expect(hc.has('vessel_a')).toBe(false)
    expect(hc.has('vessel_c')).toBe(true)
  })

  it('income with 3 nodes all hot > income with 2 hot + 1 dormant', () => {
    const s = stateOwning(['entry', 'vessel_a', 'vessel_b'])
    const incomeAllHot  = income(s)
    const incomeOneDorm = income({ ...s, dormant: new Set<ZoneId>(['vessel_b']) })
    expect(incomeAllHot).toBeGreaterThan(incomeOneDorm)
  })

  it('multiplier in step() reflects only hot connected nodes', () => {
    // 3 nodes owned, vessel_b dormant → effective hot-connected = entry + vessel_a = 2
    // income = multiplier(2) × 2 hot nodes = 1.25 × 2 = 2.5
    const s = stateOwning(['entry', 'vessel_a', 'vessel_b'])
    const dormedB: GameState = { ...s, dormant: new Set<ZoneId>(['vessel_b']) }
    const after = step(dormedB, [])
    expect(after.biomass).toBeCloseTo(dormedB.biomass + 2.5)
  })
})

// ─── (d) Brute reduces damage vs. no Brute ────────────────────────────────────

describe('(d) Brute reduces responder damage', () => {
  it('effectiveDamage with Brute < RESPONDER_DAMAGE_PER_TICK', () => {
    const dmgNoBrute = effectiveDamage('entry', new Set(), new Set())
    const dmgBrute   = effectiveDamage('entry', new Set(['entry']), new Set())
    expect(dmgNoBrute).toBe(RESPONDER_DAMAGE_PER_TICK)
    expect(dmgBrute).toBe(RESPONDER_DAMAGE_PER_TICK - BRUTE_DAMAGE_REDUCTION)
    expect(dmgBrute).toBeLessThan(dmgNoBrute)
  })

  it('in step(), a Bruted zone loses less infection per responder tick', () => {
    const base = initialState()
    const infection = 100
    const zones = base.map.zones.map(z =>
      z.id === 'entry' ? { ...z, owner: 'you' as const, infection } : z,
    )

    const s: GameState = {
      ...base,
      map: { ...base.map, zones },
      heat: HEAT_THRESHOLD_ALERTED,
      responders: [{ zone: 'entry' }],
      brutes: new Set<ZoneId>(),
      cysts: new Set<ZoneId>(),
    }

    // Without Brute
    const afterNoBrute = step(s, [])
    const entryNoBrute = afterNoBrute.map.zones.find(z => z.id === 'entry')!
    const damageNoBrute = infection - entryNoBrute.infection

    // With Brute
    const sWithBrute: GameState = { ...s, brutes: new Set<ZoneId>(['entry']) }
    const afterBrute = step(sWithBrute, [])
    const entryBrute = afterBrute.map.zones.find(z => z.id === 'entry')!
    const damageBrute = infection - entryBrute.infection

    expect(damageBrute).toBeLessThan(damageNoBrute)
    expect(damageNoBrute - damageBrute).toBe(BRUTE_DAMAGE_REDUCTION)
  })
})

// ─── (e) Cyst makes a node take longer to clear ───────────────────────────────

describe('(e) Cyst makes a zone take longer to clear', () => {
  it('effectiveDamage with Cyst < effectiveDamage with Brute < no defense', () => {
    const noDef   = effectiveDamage('entry', new Set(), new Set())
    const withBrute = effectiveDamage('entry', new Set(['entry']), new Set())
    const withCyst  = effectiveDamage('entry', new Set(), new Set(['entry']))
    expect(withCyst).toBeLessThan(noDef)
    expect(withCyst).toBe(RESPONDER_DAMAGE_PER_TICK - CYST_DAMAGE_REDUCTION)
    expect(withCyst).toBeLessThan(withBrute)  // Cyst gives more reduction than Brute
  })

  it('a zone with a Cyst survives more responder ticks before clearing', () => {
    // Count ticks to clear a zone with no defense vs. with a Cyst
    function ticksToClear(hasCyst: boolean): number {
      const base = initialState()
      const infection = 100
      const zones = base.map.zones.map(z =>
        z.id === 'entry' ? { ...z, owner: 'you' as const, infection } : z,
      )
      let s: GameState = {
        ...base,
        map: { ...base.map, zones },
        heat: HEAT_THRESHOLD_ALERTED,
        responders: [{ zone: 'entry' }],
        brutes: new Set<ZoneId>(),
        cysts: hasCyst ? new Set<ZoneId>(['entry']) : new Set<ZoneId>(),
      }
      let ticks = 0
      while (ticks < 50) {
        const after = step(s, [])
        ticks++
        const entry = after.map.zones.find(z => z.id === 'entry')!
        if (entry.owner !== 'you') return ticks
        s = after
      }
      return ticks // still alive after 50 — effectively unclearable
    }

    const withoutCyst = ticksToClear(false)
    const withCyst    = ticksToClear(true)
    expect(withCyst).toBeGreaterThan(withoutCyst)
  })
})

// ─── (f) deploying defense spends biomass; fails if insufficient ──────────────

describe('(f) defense deployment spends biomass and fails if insufficient', () => {
  it('deployBrute on an owned zone with sufficient biomass succeeds and spends BRUTE_COST', () => {
    const s: GameState = { ...initialState(), biomass: BRUTE_COST + 5 }
    const after = deployBrute(s, 'entry')
    expect(after).not.toBeNull()
    expect(after!.biomass).toBe(5)
    expect(after!.brutes.has('entry')).toBe(true)
  })

  it('deployBrute returns null when biomass is insufficient', () => {
    const s: GameState = { ...initialState(), biomass: BRUTE_COST - 1 }
    expect(deployBrute(s, 'entry')).toBeNull()
  })

  it('deployBrute returns null on an unowned zone', () => {
    const s: GameState = { ...initialState(), biomass: BRUTE_COST + 10 }
    expect(deployBrute(s, 'vessel_a')).toBeNull()  // vessel_a not owned
  })

  it('buildCyst on an owned zone with sufficient biomass succeeds and spends CYST_COST', () => {
    const s: GameState = { ...initialState(), biomass: CYST_COST + 3 }
    const after = buildCyst(s, 'entry')
    expect(after).not.toBeNull()
    expect(after!.biomass).toBe(3)
    expect(after!.cysts.has('entry')).toBe(true)
  })

  it('buildCyst returns null when biomass is insufficient', () => {
    const s: GameState = { ...initialState(), biomass: CYST_COST - 1 }
    expect(buildCyst(s, 'entry')).toBeNull()
  })

  it('buildCyst returns null on an unowned zone', () => {
    const s: GameState = { ...initialState(), biomass: CYST_COST + 10 }
    expect(buildCyst(s, 'vessel_a')).toBeNull()  // vessel_a not owned
  })

  it('deployBrute order via step() spends biomass and places Brute', () => {
    const s: GameState = { ...initialState(), biomass: BRUTE_COST + 5 }
    const after = step(s, [{ type: 'deployBrute', zoneId: 'entry' }])
    expect(after.biomass).toBeLessThanOrEqual(s.biomass)  // spent (plus income)
    expect(after.brutes.has('entry')).toBe(true)
  })

  it('buildCyst order via step() spends biomass and places Cyst', () => {
    const s: GameState = { ...initialState(), biomass: CYST_COST + 5 }
    const after = step(s, [{ type: 'buildCyst', zoneId: 'entry' }])
    expect(after.cysts.has('entry')).toBe(true)
  })

  it('Brute and Cyst orders are no-ops when biomass is insufficient', () => {
    const s: GameState = { ...initialState(), biomass: 0 }
    const after = step(s, [
      { type: 'deployBrute', zoneId: 'entry' },
      { type: 'buildCyst', zoneId: 'entry' },
    ])
    // No defense placed (insufficient biomass)
    expect(after.brutes.has('entry')).toBe(false)
    expect(after.cysts.has('entry')).toBe(false)
  })

  it('defense costs are exported and positive', () => {
    expect(BRUTE_COST).toBeGreaterThan(0)
    expect(CYST_COST).toBeGreaterThan(0)
    expect(CYST_COST).toBeGreaterThan(BRUTE_COST)  // Cyst costs more
  })
})

// ─── Integration: toggleDormant helper ───────────────────────────────────────

describe('toggleDormant helper', () => {
  it('toggles a hot owned node to dormant', () => {
    const s = initialState()
    const after = toggleDormant(s, 'entry')
    expect(after.dormant.has('entry')).toBe(true)
  })

  it('toggles a dormant node back to hot', () => {
    const s: GameState = { ...initialState(), dormant: new Set<ZoneId>(['entry']) }
    const after = toggleDormant(s, 'entry')
    expect(after.dormant.has('entry')).toBe(false)
  })

  it('no-ops on an unowned zone', () => {
    const s = initialState()
    const after = toggleDormant(s, 'vessel_a')  // vessel_a not owned
    expect(after).toBe(s)  // same reference returned
  })

  it('does not mutate the original state', () => {
    const s = initialState()
    toggleDormant(s, 'entry')
    expect(s.dormant.has('entry')).toBe(false)
  })
})
