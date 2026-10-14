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
  readonly retryDelayMs?: number
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
}

export class PaymentProviderError extends Error {
  /** The HTTP status the provider answered with, or null when no answer arrived. */
  readonly status: number | null

  constructor(status: number | null, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PaymentProviderError'
    this.status = status
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
  private readonly retryDelayMs: number
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: PaymentsClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.maxAttempts = options.maxAttempts ?? 3
    this.retryDelayMs = options.retryDelayMs ?? 250
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
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
    let failure: PaymentProviderError | undefined
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (attempt > 1) await this.sleep(this.retryDelayMs)
      const outcome = await this.attemptOnce(path, body, idempotencyKey)
      if (outcome.ok) return outcome.body
      failure = outcome.failure
      if (!failure.retryable) break
    }
    // maxAttempts is at least 1, so at least one attempt ran and `failure` is set.
    throw failure
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
      const failure = new PaymentProviderError(response.status, `payment provider answered ${response.status}: POST ${path}`)
      return { ok: false, failure }
    }
    return { ok: true, body: await response.json() }
  }
}

function stringField(body: unknown, name: string): string {
  const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined
  if (typeof value !== 'string' || value === '') {
    throw new PaymentProviderError(null, `payment provider response has no "${name}"`)
  }
  return value
}
