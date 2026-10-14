export interface Operator {
  readonly id: string
  /** SHA-256 of the operator's API key. The key itself is never configured here. */
  readonly keyHash: Buffer
}

export interface Config {
  readonly port: number
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  readonly operators: readonly Operator[]
  readonly payments: { readonly baseUrl: string; readonly apiKey: string }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const sessionSecret = required(env, 'SESSION_SECRET')
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')

  return {
    port: positiveInteger(env, 'PORT', 3000),
    sessionSecret,
    sessionTtlSeconds: positiveInteger(env, 'SESSION_TTL_SECONDS', 3600),
    operators: parseOperators(required(env, 'OPERATOR_KEYS')),
    payments: {
      baseUrl: required(env, 'PAYMENTS_BASE_URL'),
      apiKey: required(env, 'PAYMENTS_API_KEY'),
    },
  }
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

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number`)
  return value
}
