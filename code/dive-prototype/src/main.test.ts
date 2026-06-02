// Trivial smoke test — ensures Vitest is wired up and can run.
// No game logic to test yet; this will be replaced by real sim tests in later tasks.
import { describe, it, expect } from 'vitest'

describe('scaffold smoke test', () => {
  it('arithmetic works', () => {
    expect(1 + 1).toBe(2)
  })
})
