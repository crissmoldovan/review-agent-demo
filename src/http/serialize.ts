import { formatMoney } from '../format.ts'
import { type Order, lineTotal, orderTotal } from '../orders.ts'
import type { Refund } from '../refunds.ts'

// Every amount in a response is a whole number of the currency's minor unit, as in requests.
// `totalDisplay` is the same total formatted for people, so the console does not format money itself.

export function serializeOrder(order: Order) {
  const total = orderTotal(order)
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    currency: order.currency,
    total: total.amount,
    totalDisplay: formatMoney(total),
    lines: order.lines.map((line) => ({
      id: line.id,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice.amount,
      total: lineTotal(line).amount,
    })),
    createdBy: order.createdBy,
    createdAt: order.createdAt,
  }
}

/** The shape `GET /orders` lists: enough to find an order, without its lines. */
export function serializeOrderSummary(order: Order) {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    currency: order.currency,
    total: orderTotal(order).amount,
    createdAt: order.createdAt,
  }
}

export function serializeRefund(refund: Refund) {
  return {
    id: refund.id,
    orderId: refund.orderId,
    currency: refund.currency,
    total: refund.total,
    lines: refund.lines.map((line) => ({ lineId: line.lineId, amount: line.amount })),
    requestedBy: refund.requestedBy,
    createdAt: refund.createdAt,
  }
}
