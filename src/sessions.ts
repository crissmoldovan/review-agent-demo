import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Session tokens are `<key id>.<payload>.<signature>`: the payload is base64url JSON, the signature
 * an HMAC-SHA256 of `<key id>.<payload>` under the key that id names. They are not encrypted;
 * nothing secret goes in them.
 *
 * Keys rotate without logging anyone out: new tokens are signed with the keyring's current key,
 * and tokens signed with a previous key are still accepted until they expire.
 */

export interface SessionClaims {
  /** The operator the session belongs to. */
  readonly sub: string
  /** Issued at and expires at, in seconds since the epoch. */
  readonly iat: number
  readonly exp: number
}

export interface SessionKey {
  readonly id: string
  readonly secret: string
}

export interface Keyring {
  readonly current: SessionKey
  /** Keys rotated out, newest first. Tokens they signed stay valid until they expire. */
  readonly previous: readonly SessionKey[]
}

/** A bare secret is a keyring of one key, `default`: what a deployment without SESSION_KEYS has. */
export type Keys = Keyring | string

export function signSession(
  sub: string,
  keys: Keys,
  ttlSeconds: number,
  now = Date.now(),
): { token: string; claims: SessionClaims } {
  const { current } = toKeyring(keys)
  const iat = Math.floor(now / 1000)
  const claims: SessionClaims = { sub, iat, exp: iat + ttlSeconds }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signed = `${current.id}.${payload}`
  return { token: `${signed}.${hmac(current.secret, signed).toString('base64url')}`, claims }
}

/** The token's claims if it is well formed, signed with a key in `keys` and not expired; otherwise null. */
export function verifySession(token: string, keys: Keys, now = Date.now()): SessionClaims | null {
  const keyring = toKeyring(keys)
  const [keyId, payload, signature, ...rest] = token.split('.')
  if (!keyId || !payload || !signature || rest.length > 0) return null
  const signed = `${keyId}.${payload}`

  if (keyId !== keyring.current.id) {
    // Signed before the last rotation: accepted while its key is still in `previous`.
    const previous = keyring.previous.find((key) => key.id === keyId)
    if (!previous || signature !== hmac(previous.secret, signed).toString('base64url')) return null
    return decodeClaims(payload)
  }

  // Compare the encoded form, so only the one canonical spelling of a signature is accepted.
  const expected = Buffer.from(hmac(keyring.current.secret, signed).toString('base64url'))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const claims = decodeClaims(payload)
  if (!claims || claims.exp <= Math.floor(now / 1000)) return null
  return claims
}

export function toKeyring(keys: Keys): Keyring {
  return typeof keys === 'string' ? { current: { id: 'default', secret: keys }, previous: [] } : keys
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
