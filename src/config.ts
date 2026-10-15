import type { Keyring, SessionKey } from './sessions.ts'

export interface Operator {
  readonly id: string
  /** SHA-256 of the operator's API key. The key itself is never configured here. */
  readonly keyHash: Buffer
}

export interface Config {
  readonly port: number
  /** Signs new session tokens and verifies tokens signed before a rotation. */
  readonly sessionKeys: Keyring
  /** @deprecated The current key's secret. Use `sessionKeys`. */
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  readonly operators: readonly Operator[]
  readonly payments: { readonly baseUrl: string; readonly apiKey: string }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const sessionKeys: Keyring = env.SESSION_KEYS
    ? parseSessionKeys(env.SESSION_KEYS)
    : { current: { id: 'default', secret: longSecret('SESSION_SECRET', required(env, 'SESSION_SECRET')) }, previous: [] }

  return {
    port: positiveInteger(env, 'PORT', 3000),
    sessionKeys,
    sessionSecret: sessionKeys.current.secret,
    sessionTtlSeconds: positiveInteger(env, 'SESSION_TTL_SECONDS', 3600),
    operators: parseOperators(required(env, 'OPERATOR_KEYS')),
    payments: {
      baseUrl: required(env, 'PAYMENTS_BASE_URL'),
      apiKey: required(env, 'PAYMENTS_API_KEY'),
    },
  }
}

/** `SESSION_KEYS` is `id:secret` pairs separated by commas, the current key first. */
export function parseSessionKeys(value: string): Keyring {
  const keys = value.split(',').map((entry): SessionKey => {
    const separator = entry.indexOf(':')
    const id = entry.slice(0, separator).trim()
    if (separator < 1 || !/^[\w-]+$/.test(id)) {
      throw new Error('SESSION_KEYS entries must look like "<id>:<secret>", the id letters, digits, - or _')
    }
    return { id, secret: longSecret('SESSION_KEYS', entry.slice(separator + 1).trim()) }
  })
  if (new Set(keys.map((key) => key.id)).size !== keys.length) throw new Error('SESSION_KEYS has a repeated id')
  const [current, ...previous] = keys
  return { current, previous }
}

/** `OPERATOR_KEYS` is `id:sha256hex` pairs separated by commas. */
export function parseOperators(value: string): Operator[] {
  return value.split(',').map((entry) => {
    const [id, hash, ...rest] = entry.trim().split(':')
    if (!id || !hash || rest.length > 0 || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error('OPERATOR_KEYS entries must look like "<id>:<sha256 hex of the key>"')
    }
    return { id, keyHash: Buffer.from(hash, 'hex') }
  })
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function longSecret(name: string, secret: string): string {
  if (secret.length < 32) throw new Error(`${name}: every secret must be at least 32 characters`)
  return secret
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number`)
  return value
}
