import { describe, expect, it } from 'vitest'
import { constantTimeEqual, isBearerAuthorized } from '../src/security'

describe('security helpers', () => {
  it('compares configured secrets', () => {
    expect(constantTimeEqual('secret', 'secret')).toBe(true)
    expect(constantTimeEqual('secret', 'different')).toBe(false)
    expect(constantTimeEqual(null, 'secret')).toBe(false)
  })

  it('requires an exact Bearer token', () => {
    expect(isBearerAuthorized('Bearer admin-secret', 'admin-secret')).toBe(true)
    expect(isBearerAuthorized('Basic admin-secret', 'admin-secret')).toBe(false)
    expect(isBearerAuthorized('Bearer wrong', 'admin-secret')).toBe(false)
  })
})
