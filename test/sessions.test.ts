import { describe, expect, it } from 'vitest'
import { type Keyring, signSession, verifySession } from '../src/sessions.ts'

const SECRET = 'test-secret-that-is-long-enough-0123456789'
const NOW = Date.UTC(2026, 0, 1)
const OCTOBER: Keyring = { current: { id: '2026-10', secret: SECRET }, previous: [] }
const NOVEMBER: Keyring = {
  current: { id: '2026-11', secret: 'next-secret-that-is-long-enough-0123456789' },
  previous: [OCTOBER.current],
}

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
    const [keyId, , signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'op-2', iat: 0, exp: 9e9 })).toString('base64url')
    expect(verifySession(`${keyId}.${forged}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c.d', '..sig']) expect(verifySession(token, SECRET, NOW)).toBeNull()
  })

  it('names the signing key in the token', () => {
    expect(signSession('op-1', OCTOBER, 3600, NOW).token.startsWith('2026-10.')).toBe(true)
    expect(signSession('op-1', SECRET, 3600, NOW).token.startsWith('default.')).toBe(true)
  })

  it('accepts a token signed with the previous key after a rotation', () => {
    const { token } = signSession('op-1', OCTOBER, 3600, NOW)
    expect(verifySession(token, NOVEMBER, NOW + 1000)).toMatchObject({ sub: 'op-1' })
  })

  it('rejects a token once its key has left the keyring', () => {
    const { token } = signSession('op-1', OCTOBER, 3600, NOW)
    expect(verifySession(token, { current: NOVEMBER.current, previous: [] }, NOW + 1000)).toBeNull()
  })
})
