import { describe, it, expect } from 'vitest'
import { buildMap, neighbors } from './map'

describe('buildMap — zone count', () => {
  it('returns exactly 10 zones', () => {
    const map = buildMap()
    expect(map.zones.length).toBe(10)
  })
})

describe('buildMap — portals', () => {
  it('entry zone has kind "portal"', () => {
    const map = buildMap()
    const entry = map.zones.find(z => z.id === 'entry')
    expect(entry).toBeDefined()
    expect(entry!.kind).toBe('portal')
  })

  it('organ zone has kind "portal"', () => {
    const map = buildMap()
    const organ = map.zones.find(z => z.id === 'organ')
    expect(organ).toBeDefined()
    expect(organ!.kind).toBe('portal')
  })

  it('organ_b zone has kind "portal" (second organ)', () => {
    const map = buildMap()
    const organB = map.zones.find(z => z.id === 'organ_b')
    expect(organB).toBeDefined()
    expect(organB!.kind).toBe('portal')
  })

  it('exactly two portal zones exist (organ and organ_b, plus entry makes 3 total)', () => {
    const map = buildMap()
    const portals = map.zones.filter(z => z.kind === 'portal')
    // entry, organ, organ_b
    expect(portals.length).toBe(3)
  })
})

describe('buildMap — barriers (original gland + new pickup)', () => {
  it('gland is reachable from vessel_b only via a barrier edge', () => {
    const map = buildMap()
    const vesselBNeighbors = neighbors(map, 'vessel_b')
    const glandEdge = vesselBNeighbors.find(n => n.id === 'gland')
    expect(glandEdge).toBeDefined()
    expect(glandEdge!.barrier).toBe(true)
  })

  it('gland is NOT reachable from vessel_b by a non-barrier edge', () => {
    const map = buildMap()
    const vesselBNeighbors = neighbors(map, 'vessel_b')
    const nonBarrierGland = vesselBNeighbors.find(n => n.id === 'gland' && !n.barrier)
    expect(nonBarrierGland).toBeUndefined()
  })

  it('pickup zone has kind "pickup"', () => {
    const map = buildMap()
    const pickup = map.zones.find(z => z.id === 'pickup')
    expect(pickup).toBeDefined()
    expect(pickup!.kind).toBe('pickup')
  })

  it('pickup is reachable from vessel_d only via a barrier edge (second barrier)', () => {
    const map = buildMap()
    const vesselDNeighbors = neighbors(map, 'vessel_d')
    const pickupEdge = vesselDNeighbors.find(n => n.id === 'pickup')
    expect(pickupEdge).toBeDefined()
    expect(pickupEdge!.barrier).toBe(true)
  })
})

describe('buildMap — chokepoint (vessel_a)', () => {
  it('vessel_a is the only open path from entry to organ (organ not adjacent to entry)', () => {
    const map = buildMap()
    // organ is reachable from entry only through vessel_a or vessel_b — not directly
    const entryNeighbors = neighbors(map, 'entry').map(n => n.id)
    expect(entryNeighbors).not.toContain('organ')
  })

  it('vessel_c is only directly connected to vessel_a and organ (vessel_a is its sole entry-side neighbor)', () => {
    const map = buildMap()
    // vessel_c's open neighbors must be exactly vessel_a and organ.
    // This confirms vessel_a is the sole direct link from the entry side into the upper lobe branch.
    const vesselCNeighbors = neighbors(map, 'vessel_c').filter(n => !n.barrier).map(n => n.id).sort()
    expect(vesselCNeighbors).toEqual(['organ', 'vessel_a'].sort())
    // And vessel_c has no direct edge to entry — vessel_a is the bottleneck
    expect(vesselCNeighbors).not.toContain('entry')
  })
})

describe('buildMap — multiple paths and loops', () => {
  it('organ is reachable from entry via at least two distinct immediate parents', () => {
    const map = buildMap()
    // Both vessel_a and vessel_b connect to organ (open edges)
    const organNeighbors = neighbors(map, 'organ').filter(n => !n.barrier).map(n => n.id)
    expect(organNeighbors).toContain('vessel_a')
    expect(organNeighbors).toContain('vessel_b')
    expect(organNeighbors).toContain('vessel_c')
  })

  it('a cycle exists: entry → vessel_e → vessel_d → vessel_b → entry (loop)', () => {
    const map = buildMap()
    // Check each link of the loop
    const entryNeighbors = neighbors(map, 'entry').filter(n => !n.barrier).map(n => n.id)
    expect(entryNeighbors).toContain('vessel_e')

    const vesselENeighbors = neighbors(map, 'vessel_e').filter(n => !n.barrier).map(n => n.id)
    expect(vesselENeighbors).toContain('vessel_d')

    const vesselDNeighbors = neighbors(map, 'vessel_d').filter(n => !n.barrier).map(n => n.id)
    expect(vesselDNeighbors).toContain('vessel_b')

    const vesselBNeighbors = neighbors(map, 'vessel_b').filter(n => !n.barrier).map(n => n.id)
    expect(vesselBNeighbors).toContain('entry')
  })

  it('organ_b is reachable from entry via vessel_b → vessel_d (different route from organ)', () => {
    const map = buildMap()
    const vesselDNeighbors = neighbors(map, 'vessel_d').filter(n => !n.barrier).map(n => n.id)
    expect(vesselDNeighbors).toContain('organ_b')
  })
})
