import { describe, expect, it } from 'vitest'
import { signSession, verifySession } from '../src/sessions.ts'

const SECRET = 'test-secret-that-is-long-enough-0123456789'
const NOW = Date.UTC(2026, 0, 1)

describe('sessions', () => {
  it('verifies a token it signed', () => {
    const { token } = signSession('op-1', SECRET, 3600, NOW)
    expect(verifySession(token, SECRET, NOW + 1000)).toMatchObject({ sub: 'op-1' })
  })

  it('rejects an expired token', () => {
    const { token } = signSession('op-1', SECRET, 60, NOW)
    expect(verifySession(token, SECRET, NOW + 60_000)).toBeNull()
  })

  it('rejects a token signed with another secret', () => {
    const { token } = signSession('op-1', 'another-secret-that-is-long-enough-0123', 3600, NOW)
    expect(verifySession(token, SECRET, NOW)).toBeNull()
  })

  it('rejects a token whose payload was changed', () => {
    const { token } = signSession('op-1', SECRET, 3600, NOW)
    const [, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'op-2', iat: 0, exp: 9e9 })).toString('base64url')
    expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    for (const token of ['', 'abc', 'a.b.c', '.sig']) expect(verifySession(token, SECRET, NOW)).toBeNull()
  })
})
