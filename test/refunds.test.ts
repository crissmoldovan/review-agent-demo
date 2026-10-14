import { describe, expect, it } from 'vitest'
import { money } from '../src/money.ts'
import { type Order, OrderStore } from '../src/orders.ts'
import type { PaymentsGateway } from '../src/payments.ts'
import { RefundError, RefundService, RefundStore, planRefund } from '../src/refunds.ts'

function order(lines: Array<{ id: string; quantity: number; unitPrice: number }>): Order {
  return {
    id: 'ord_1',
    customerId: 'cus_1',
    currency: 'USD',
    lines: lines.map((line) => ({ ...line, sku: `sku-${line.id}`, unitPrice: money(line.unitPrice, 'USD') })),
    captureId: 'cap_1',
    status: 'paid',
    createdBy: 'op-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const twoLines = order([
  { id: 'a', quantity: 1, unitPrice: 1000 },
  { id: 'b', quantity: 3, unitPrice: 1000 },
])

describe('planRefund', () => {
  it('splits a partial refund in proportion to each line', () => {
    expect(planRefund(twoLines, 2000, []).lines).toEqual([
      { lineId: 'a', amount: 500 },
      { lineId: 'b', amount: 1500 },
    ])
  })

  it('refunds every line in full when the whole order is refunded', () => {
    expect(planRefund(twoLines, 4000, []).lines).toEqual([
      { lineId: 'a', amount: 1000 },
      { lineId: 'b', amount: 3000 },
    ])
  })

  it('refuses more than is left to refund', () => {
    const first = { ...planRefund(twoLines, 3000, []), id: 'r1', orderId: 'ord_1', currency: 'USD' as const }
    const previous = [{ ...first, providerRefundId: 're_1', requestedBy: 'op-1', createdAt: '' }]
    expect(() => planRefund(twoLines, 1001, previous)).toThrow(RefundError)
  })
})

describe('RefundService', () => {
  function setup() {
    const calls: number[] = []
    const payments: PaymentsGateway = {
      capture: async () => ({ captureId: 'cap_1' }),
      refund: async (request) => {
        calls.push(request.amount)
        return { refundId: `re_${calls.length}` }
      },
    }
    const orders = new OrderStore()
    orders.save(twoLines)
    const service = new RefundService({ orders, refunds: new RefundStore(), payments })
    return { calls, orders, service }
  }

  it('marks the order refunded once everything is refunded', async () => {
    const { orders, service } = setup()
    await service.refund('ord_1', 1000, 'op-1', 'k1')
    expect(orders.get('ord_1')?.status).toBe('partially_refunded')
    await service.refund('ord_1', 3000, 'op-1', 'k2')
    expect(orders.get('ord_1')?.status).toBe('refunded')
  })

  it('refunds once per idempotency key', async () => {
    const { calls, service } = setup()
    const [first, second] = await Promise.all([
      service.refund('ord_1', 500, 'op-1', 'same'),
      service.refund('ord_1', 500, 'op-1', 'same'),
    ])
    expect(second).toBe(first)
    expect(calls).toEqual([500])
  })
})
