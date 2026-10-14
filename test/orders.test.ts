import { describe, expect, it } from 'vitest'
import { HttpError } from '../src/http/router.ts'
import { CreateOrderBody, parse } from '../src/http/schemas.ts'
import { serializeOrder } from '../src/http/serialize.ts'
import { OrderService, OrderStore, orderTotal } from '../src/orders.ts'
import type { CaptureRequest, PaymentsGateway } from '../src/payments.ts'

const body = {
  customerId: 'cus_1',
  currency: 'EUR',
  paymentId: 'pay_1',
  lines: [
    { sku: 'mug', quantity: 2, unitPrice: 1250 },
    { sku: 'tea', quantity: 1, unitPrice: 899 },
  ],
}

function setup() {
  const captures: CaptureRequest[] = []
  const payments: PaymentsGateway = {
    capture: async (request) => {
      captures.push(request)
      return { captureId: `cap_${captures.length}` }
    },
    refund: async () => ({ refundId: 're_1' }),
  }
  const store = new OrderStore()
  return { captures, store, service: new OrderService({ store, payments }) }
}

describe('OrderService.place', () => {
  it('captures the order total and stores the order', async () => {
    const { captures, store, service } = setup()
    const order = await service.place(parse(CreateOrderBody, body), 'op-1', 'k1')
    expect(captures).toEqual([{ paymentId: 'pay_1', amount: 3399, currency: 'EUR' }])
    expect(orderTotal(order).amount).toBe(3399)
    expect(store.get(order.id)).toEqual(order)
  })

  it('places one order per idempotency key', async () => {
    const { captures, service } = setup()
    const input = parse(CreateOrderBody, body)
    const first = await service.place(input, 'op-1', 'k1')
    const again = await service.place(input, 'op-1', 'k1')
    expect(again.id).toBe(first.id)
    expect(captures).toHaveLength(1)
  })

  it('keeps notes trimmed, and drops notes that are only whitespace', async () => {
    const { service } = setup()
    const withNotes = await service.place(parse(CreateOrderBody, { ...body, notes: '  Leave at reception.  ' }), 'op-1', 'k1')
    expect(serializeOrder(withNotes).notes).toBe('Leave at reception.')
    const blank = await service.place(parse(CreateOrderBody, { ...body, notes: '   ' }), 'op-1', 'k2')
    expect(blank.notes).toBeUndefined()
    expect(serializeOrder(blank).notes).toBeNull()
  })
})

describe('CreateOrderBody', () => {
  it('refuses fractional prices', () => {
    const fractional = { ...body, lines: [{ sku: 'mug', quantity: 1, unitPrice: 12.5 }] }
    expect(() => parse(CreateOrderBody, fractional)).toThrow(HttpError)
  })

  it('refuses a currency it does not know', () => {
    expect(() => parse(CreateOrderBody, { ...body, currency: 'XXX' })).toThrow(HttpError)
  })

  it('accepts notes up to 500 characters and no longer', () => {
    expect(parse(CreateOrderBody, { ...body, notes: 'x'.repeat(500) }).notes).toHaveLength(500)
    expect(() => parse(CreateOrderBody, { ...body, notes: 'x'.repeat(501) })).toThrow(HttpError)
  })
})
