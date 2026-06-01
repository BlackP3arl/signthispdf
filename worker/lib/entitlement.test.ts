import { describe, it, expect } from 'vitest'
import { createToken, verifyToken } from './entitlement'

const SECRET = 'test-secret-value-please-change'

describe('entitlement token', () => {
  it('round-trips sid', async () => {
    const token = await createToken(SECRET, 'sid-123')
    const payload = await verifyToken(SECRET, token)
    expect(payload?.sid).toBe('sid-123')
  })

  it('rejects a tampered token', async () => {
    const token = await createToken(SECRET, 'sid-123')
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa')
    expect(await verifyToken(SECRET, tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createToken(SECRET, 'sid-123')
    expect(await verifyToken('other-secret', token)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await createToken(SECRET, 'sid-123', Date.now() - 1000)
    expect(await verifyToken(SECRET, token)).toBeNull()
  })

  it('rejects undefined / malformed input', async () => {
    expect(await verifyToken(SECRET, undefined)).toBeNull()
    expect(await verifyToken(SECRET, 'nodot')).toBeNull()
  })
})
