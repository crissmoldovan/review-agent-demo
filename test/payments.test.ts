import { describe, expect, it } from 'vitest'
import { PaymentProviderError, PaymentsClient } from '../src/payments.ts'

type Answer = number | 'network' | { status: number; retryAfter: string }

function fakeProvider(answers: Answer[]) {
  const keys: string[] = []
  const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
    const answer = answers.shift()
    if (answer === undefined) throw new Error('the test ran out of answers')
    if (answer === 'network') throw new TypeError('fetch failed')
    if (typeof answer === 'object') {
      return new Response(null, { status: answer.status, headers: { 'retry-after': answer.retryAfter } })
    }
    return new Response(JSON.stringify({ id: 're_1' }), { status: answer })
  }) as typeof globalThis.fetch
  return { fetch, keys }
}

const options = { baseUrl: 'https://payments.example.test', apiKey: 'test-key', sleep: async () => {} }

describe('PaymentsClient', () => {
  it('retries a 503 and returns the answer that follows', async () => {
    const provider = fakeProvider([503, 200])
    const client = new PaymentsClient({ ...options, fetch: provider.fetch })
    await expect(client.refund({ captureId: 'cap_1', amount: 100, currency: 'USD' }, 'k1')).resolves.toEqual({
      refundId: 're_1',
    })
    expect(provider.keys).toEqual(['k1', 'k1'])
  })

  it('retries when the provider cannot be reached', async () => {
    const provider = fakeProvider(['network', 200])
    const client = new PaymentsClient({ ...options, fetch: provider.fetch })
    await expect(client.capture({ paymentId: 'pay_1', amount: 100, currency: 'USD' }, 'k2')).resolves.toEqual({
      captureId: 're_1',
    })
  })

  it('backs off exponentially, with jitter, between attempts', async () => {
    const provider = fakeProvider([503, 503, 200])
    const delays: number[] = []
    const sleep = async (ms: number) => void delays.push(ms)
    const client = new PaymentsClient({ ...options, fetch: provider.fetch, sleep, baseDelayMs: 100, random: () => 0.5 })
    await client.refund({ captureId: 'cap_1', amount: 100, currency: 'USD' }, 'k4')
    expect(delays).toEqual([50, 100])
  })

  it('waits as long as Retry-After asks, but no longer than maxDelayMs', async () => {
    const provider = fakeProvider([{ status: 429, retryAfter: '2' }, { status: 503, retryAfter: '60' }, 200])
    const delays: number[] = []
    const sleep = async (ms: number) => void delays.push(ms)
    const client = new PaymentsClient({ ...options, fetch: provider.fetch, sleep, maxDelayMs: 5000 })
    await client.refund({ captureId: 'cap_1', amount: 100, currency: 'USD' }, 'k5')
    expect(delays).toEqual([2000, 5000])
  })

  it('does not retry a 400', async () => {
    const provider = fakeProvider([400])
    const client = new PaymentsClient({ ...options, fetch: provider.fetch })
    await expect(client.refund({ captureId: 'cap_1', amount: 100, currency: 'USD' }, 'k3')).rejects.toBeInstanceOf(
      PaymentProviderError,
    )
    expect(provider.keys).toHaveLength(1)
  })
})
