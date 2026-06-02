import { describe, it, expect } from 'vitest'
import { buildMap, neighbors } from './map'

describe('buildMap', () => {
  it('returns exactly 5 zones', () => {
    const map = buildMap()
    expect(map.zones.length).toBe(5)
  })

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
})
