import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Session tokens are `<payload>.<signature>`: the payload is base64url JSON, the signature an
 * HMAC-SHA256 of the payload under the session secret. They are not encrypted; nothing secret
 * goes in them.
 */

export interface SessionClaims {
  /** The operator the session belongs to. */
  readonly sub: string
  /** Issued at and expires at, in seconds since the epoch. */
  readonly iat: number
  readonly exp: number
}

export function signSession(
  sub: string,
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): { token: string; claims: SessionClaims } {
  const iat = Math.floor(now / 1000)
  const claims: SessionClaims = { sub, iat, exp: iat + ttlSeconds }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return { token: `${payload}.${hmac(secret, payload).toString('base64url')}`, claims }
}

/** The token's claims if it is well formed, signed with `secret` and not expired; otherwise null. */
export function verifySession(token: string, secret: string, now = Date.now()): SessionClaims | null {
  const [payload, signature, ...rest] = token.split('.')
  if (!payload || !signature || rest.length > 0) return null

  // Compare the encoded form, so only the one canonical spelling of a signature is accepted.
  const expected = Buffer.from(hmac(secret, payload).toString('base64url'))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const claims = decodeClaims(payload)
  if (!claims || claims.exp <= Math.floor(now / 1000)) return null
  return claims
}

function hmac(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

function decodeClaims(payload: string): SessionClaims | null {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { sub, iat, exp } = value as Record<string, unknown>
  if (typeof sub !== 'string' || !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null
  return { sub, iat: iat as number, exp: exp as number }
}
