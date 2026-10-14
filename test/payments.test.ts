import { describe, expect, it } from 'vitest'
import { PaymentProviderError, PaymentsClient } from '../src/payments.ts'

function fakeProvider(answers: Array<number | 'network'>) {
  const keys: string[] = []
  const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
    const answer = answers.shift()
    if (answer === undefined) throw new Error('the test ran out of answers')
    if (answer === 'network') throw new TypeError('fetch failed')
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

  it('does not retry a 400', async () => {
    const provider = fakeProvider([400])
    const client = new PaymentsClient({ ...options, fetch: provider.fetch })
    await expect(client.refund({ captureId: 'cap_1', amount: 100, currency: 'USD' }, 'k3')).rejects.toBeInstanceOf(
      PaymentProviderError,
    )
    expect(provider.keys).toHaveLength(1)
  })
})
