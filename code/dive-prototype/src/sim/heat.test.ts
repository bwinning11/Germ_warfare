import { describe, it, expect } from 'vitest'
import {
  heatStage,
  HEAT_THRESHOLD_ALERTED,
  HEAT_THRESHOLD_ACTIVE,
  HEAT_THRESHOLD_OVERWHELMING,
} from './heat'

describe('heatStage()', () => {
  it('returns calm below alerted threshold', () => {
    expect(heatStage(0)).toBe('calm')
    expect(heatStage(HEAT_THRESHOLD_ALERTED - 1)).toBe('calm')
  })

  it('returns alerted at the alerted threshold', () => {
    expect(heatStage(HEAT_THRESHOLD_ALERTED)).toBe('alerted')
  })

  it('returns active at the active threshold', () => {
    expect(heatStage(HEAT_THRESHOLD_ACTIVE)).toBe('active')
  })

  it('returns overwhelming at the overwhelming threshold', () => {
    expect(heatStage(HEAT_THRESHOLD_OVERWHELMING)).toBe('overwhelming')
  })

  it('thresholds are in ascending order', () => {
    expect(HEAT_THRESHOLD_ALERTED).toBeLessThan(HEAT_THRESHOLD_ACTIVE)
    expect(HEAT_THRESHOLD_ACTIVE).toBeLessThan(HEAT_THRESHOLD_OVERWHELMING)
  })
})
