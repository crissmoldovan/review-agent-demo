import { randomUUID } from 'node:crypto'
import { Idempotency } from './idempotency.ts'
import { type Currency, allocate } from './money.ts'
import { type Order, type OrderStore, lineTotal, orderTotal } from './orders.ts'
import type { PaymentsGateway } from './payments.ts'

export interface RefundLine {
  readonly lineId: string
  readonly amount: number
}

export interface Refund {
  readonly id: string
  readonly orderId: string
  readonly currency: Currency
  /** What the provider refunded. Always the sum of `lines`. */
  readonly total: number
  readonly lines: readonly RefundLine[]
  readonly providerRefundId: string
  readonly requestedBy: string
  readonly createdAt: string
}

export interface RefundPlan {
  readonly total: number
  readonly lines: readonly RefundLine[]
}

export class RefundError extends Error {}

export function refundedTotal(refunds: readonly Refund[]): number {
  return refunds.reduce((acc, refund) => acc + refund.total, 0)
}

export function refundedForLine(lineId: string, refunds: readonly Refund[]): number {
  let refunded = 0
  for (const refund of refunds) {
    for (const line of refund.lines) if (line.lineId === lineId) refunded += line.amount
  }
  return refunded
}

/**
 * Splits a refund across the order's lines in proportion to what each line has left to refund,
 * so the lines always add up to the refund and no line is refunded more than it cost.
 */
export function planRefund(order: Order, amount: number, previous: readonly Refund[]): RefundPlan {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RefundError('amount must be a positive whole number of minor units')
  }
  const refundable = orderTotal(order).amount - refundedTotal(previous)
  if (amount > refundable) {
    throw new RefundError(`at most ${refundable} can be refunded on order ${order.id}`)
  }

  const remaining = order.lines.map((line) => lineTotal(line).amount - refundedForLine(line.id, previous))
  const shares = allocate(amount, remaining)

  return {
    total: amount,
    lines: order.lines
      .map((line, i) => ({ lineId: line.id, amount: shares[i] }))
      .filter((line) => line.amount > 0),
  }
}

export class RefundStore {
  private readonly byOrder = new Map<string, Refund[]>()

  forOrder(orderId: string): readonly Refund[] {
    return this.byOrder.get(orderId) ?? []
  }

  add(refund: Refund): void {
    this.byOrder.set(refund.orderId, [...this.forOrder(refund.orderId), refund])
  }
}

export class RefundService {
  private readonly orders: OrderStore
  private readonly refunds: RefundStore
  private readonly payments: PaymentsGateway
  private readonly now: () => Date
  private readonly idempotency = new Idempotency<Refund>()
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(deps: { orders: OrderStore; refunds: RefundStore; payments: PaymentsGateway; now?: () => Date }) {
    this.orders = deps.orders
    this.refunds = deps.refunds
    this.payments = deps.payments
    this.now = deps.now ?? (() => new Date())
  }

  refund(orderId: string, amount: number, requestedBy: string, idempotencyKey: string): Promise<Refund> {
    const key = `${orderId}:${idempotencyKey}`
    return this.idempotency.run(key, () =>
      this.oneAtATime(orderId, () => this.execute(orderId, amount, requestedBy, key)),
    )
  }

  private async execute(orderId: string, amount: number, requestedBy: string, key: string): Promise<Refund> {
    const order = this.orders.get(orderId)
    if (!order) throw new RefundError(`order ${orderId} not found`)
    const previous = this.refunds.forOrder(orderId)
    const plan = planRefund(order, amount, previous)

    const { refundId } = await this.payments.refund(
      { captureId: order.captureId, amount: plan.total, currency: order.currency },
      `refund:${key}`,
    )
    const refund: Refund = {
      id: randomUUID(),
      orderId,
      currency: order.currency,
      total: plan.total,
      lines: plan.lines,
      providerRefundId: refundId,
      requestedBy,
      createdAt: this.now().toISOString(),
    }
    this.refunds.add(refund)
    const fullyRefunded = refundedTotal([...previous, refund]) === orderTotal(order).amount
    this.orders.setStatus(orderId, fullyRefunded ? 'refunded' : 'partially_refunded')
    return refund
  }

  /** Refunds on one order run one after another, so two cannot both pass the refundable check. */
  private oneAtATime<T>(orderId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(orderId) ?? Promise.resolve()
    const result = previous.then(task, task)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    this.queues.set(orderId, settled)
    void settled.then(() => {
      if (this.queues.get(orderId) === settled) this.queues.delete(orderId)
    })
    return result
  }
}
