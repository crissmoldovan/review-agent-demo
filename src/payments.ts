import type { Currency } from './money.ts'

/** What the services need from the payment provider. Tests pass their own. */
export interface PaymentsGateway {
  capture(request: CaptureRequest, idempotencyKey: string): Promise<{ captureId: string }>
  refund(request: RefundRequest, idempotencyKey: string): Promise<{ refundId: string }>
}

export interface CaptureRequest {
  readonly paymentId: string
  readonly amount: number
  readonly currency: Currency
}

export interface RefundRequest {
  readonly captureId: string
  readonly amount: number
  readonly currency: Currency
}

export interface PaymentsClientOptions {
  readonly baseUrl: string
  readonly apiKey: string
  /** Attempts per call, the first one included. */
  readonly maxAttempts?: number
  /** The longest wait before the second attempt; it doubles after each further failure. */
  readonly baseDelayMs?: number
  /** No wait is longer than this, whatever the backoff or the provider's Retry-After says. */
  readonly maxDelayMs?: number
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
  readonly random?: () => number
}

export class PaymentProviderError extends Error {
  /** The HTTP status the provider answered with, or null when no answer arrived. */
  readonly status: number | null
  /** How long the provider asked us to wait before trying again, when it said. */
  readonly retryAfterMs: number | null

  constructor(status: number | null, message: string, options?: ErrorOptions & { retryAfterMs?: number | null }) {
    super(message, options)
    this.name = 'PaymentProviderError'
    this.status = status
    this.retryAfterMs = options?.retryAfterMs ?? null
  }

  /** No answer, a rate limit or a server error is worth another attempt; any other 4xx is not. */
  get retryable(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500
  }
}

type Outcome = { ok: true; body: unknown } | { ok: false; failure: PaymentProviderError }

/** The provider's HTTP API. Retries are safe because every attempt carries the same Idempotency-Key. */
export class PaymentsClient implements PaymentsGateway {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number

  constructor(options: PaymentsClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.maxAttempts = options.maxAttempts ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 250
    this.maxDelayMs = options.maxDelayMs ?? 5_000
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.random = options.random ?? Math.random
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a whole number of at least 1')
    }
  }

  async capture(request: CaptureRequest, idempotencyKey: string): Promise<{ captureId: string }> {
    const body = await this.post('/v1/captures', request, idempotencyKey)
    return { captureId: stringField(body, 'id') }
  }

  async refund(request: RefundRequest, idempotencyKey: string): Promise<{ refundId: string }> {
    const body = await this.post('/v1/refunds', request, idempotencyKey)
    return { refundId: stringField(body, 'id') }
  }

  private async post(path: string, body: unknown, idempotencyKey: string): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.attemptOnce(path, body, idempotencyKey)
      if (outcome.ok) return outcome.body
      const { failure } = outcome
      if (!failure.retryable || attempt > this.maxAttempts) throw failure
      await this.sleep(this.delayAfter(attempt, failure.retryAfterMs))
    }
  }

  /**
   * How long to wait after a failed attempt: what the provider's Retry-After asked for when it sent
   * one, otherwise exponential backoff with full jitter. Never longer than maxDelayMs.
   */
  private delayAfter(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) return Math.min(retryAfterMs, this.maxDelayMs)
    const ceiling = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1))
    return Math.floor(this.random() * ceiling)
  }

  private async attemptOnce(path: string, body: unknown, idempotencyKey: string): Promise<Outcome> {
    let response: Response
    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (cause) {
      const failure = new PaymentProviderError(null, `payment provider unreachable: POST ${path}`, { cause })
      return { ok: false, failure }
    }
    if (!response.ok) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
      const failure = new PaymentProviderError(response.status, `payment provider answered ${response.status}: POST ${path}`, {
        retryAfterMs,
      })
      return { ok: false, failure }
    }
    return { ok: true, body: await response.json() }
  }
}

/** Retry-After as a number of seconds, the only form the provider sends. Anything else is ignored. */
function parseRetryAfter(value: string | null): number | null {
  const trimmed = value?.trim() ?? ''
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) * 1000 : null
}

function stringField(body: unknown, name: string): string {
  const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined
  if (typeof value !== 'string' || value === '') {
    throw new PaymentProviderError(null, `payment provider response has no "${name}"`)
  }
  return value
}
