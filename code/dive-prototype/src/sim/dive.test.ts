import { describe, it, expect } from 'vitest'
import { initialState, step, VIRALITY_PER_ZONE, VIRALITY_PER_TICK, virality } from './dive'

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

describe('result / escape / caught', () => {
  // ── helper: build a state where the player owns a portal ──────────────────
  function stateOwningPortal(): ReturnType<typeof initialState> {
    // initialState already owns 'entry' (kind:'portal')
    return initialState()
  }

  // ── (a) valid escape while holding a portal ────────────────────────────────
  it('escape order on an owned portal → result:escape, banked = virality formula', () => {
    const s0 = stateOwningPortal()
    // entry is owned and is kind:'portal'
    const s1 = step(s0, [{ type: 'escape', portal: 'entry' }])
    expect(s1.result).toBe('escape')
    const zonesHeld = s0.map.zones.filter(z => z.owner === 'you').length
    expect(s1.banked).toBe(virality(zonesHeld, s0.tick))
    expect(s1.banked).toBeGreaterThanOrEqual(0)
  })

  // ── (a) monotonic: more zones held → more banked ──────────────────────────
  it('virality is strictly monotone in zonesHeld', () => {
    const fewer = virality(1, 5)
    const more  = virality(3, 5)
    expect(more).toBeGreaterThan(fewer)
  })

  // ── (a) monotonic: more ticks survived → more banked ─────────────────────
  it('virality is strictly monotone in ticksSurvived', () => {
    const early = virality(2, 1)
    const late  = virality(2, 10)
    expect(late).toBeGreaterThan(early)
  })

  // ── (b) escape naming a portal you do NOT own → rejected, dive continues ──
  it('escape order naming an unowned portal → ignored, game continues', () => {
    const s0 = stateOwningPortal()
    // 'organ' is kind:'portal' but not owned
    const s1 = step(s0, [{ type: 'escape', portal: 'organ' }])
    expect(s1.result).toBe('ongoing')
    expect(s1.tick).toBe(s0.tick + 1)
  })

  // ── (b) escape naming a non-portal zone → rejected, dive continues ────────
  it('escape order naming a non-portal zone → ignored, game continues', () => {
    const s0 = stateOwningPortal()
    // 'vessel_a' is connective, not portal
    const s1 = step(s0, [{ type: 'escape', portal: 'vessel_a' }])
    expect(s1.result).toBe('ongoing')
    expect(s1.tick).toBe(s0.tick + 1)
  })

  // ── (c) heat reaching overwhelming → result:caught, banked:0 ──────────────
  it('when heat hits overwhelming after the tick → result:caught, banked:0', () => {
    const s0 = stateOwningPortal()
    // Inject heat just below overwhelming so ONE tick pushes it over
    // HEAT_THRESHOLD_OVERWHELMING = 90; with 1 zone owned, heat rises 2/tick
    // Set heat to 88 → next tick adds 2 → 90 → overwhelming
    const hotState = { ...s0, heat: 88 }
    const s1 = step(hotState, [])
    expect(s1.result).toBe('caught')
    expect(s1.banked).toBe(0)
  })

  // ── (d) calling step on a terminal state returns it unchanged ───────────────
  it('step on escape terminal state returns it unchanged', () => {
    const s0 = stateOwningPortal()
    const terminal = step(s0, [{ type: 'escape', portal: 'entry' }])
    expect(terminal.result).toBe('escape')
    const again = step(terminal, [])
    expect(again).toEqual(terminal)
  })

  it('step on caught terminal state returns it unchanged', () => {
    const s0 = { ...stateOwningPortal(), heat: 88 }
    const terminal = step(s0, [])
    expect(terminal.result).toBe('caught')
    const again = step(terminal, [{ type: 'dormancy' }])
    expect(again).toEqual(terminal)
  })

  // ── initial state has result:'ongoing' and banked:0 ──────────────────────
  it('initialState has result ongoing and banked 0', () => {
    const s0 = initialState()
    expect(s0.result).toBe('ongoing')
    expect(s0.banked).toBe(0)
  })
})
