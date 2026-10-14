import { randomUUID } from 'node:crypto'
import { Idempotency } from './idempotency.ts'
import { type Currency, type Money, money, multiply, sum } from './money.ts'
import type { PaymentsGateway } from './payments.ts'

export type OrderStatus = 'paid' | 'partially_refunded' | 'refunded'

export interface OrderLine {
  readonly id: string
  readonly sku: string
  readonly quantity: number
  readonly unitPrice: Money
}

export interface Order {
  readonly id: string
  readonly customerId: string
  readonly currency: Currency
  readonly lines: readonly OrderLine[]
  readonly captureId: string
  readonly status: OrderStatus
  readonly createdBy: string
  readonly createdAt: string
}

export interface NewOrder {
  readonly customerId: string
  readonly currency: Currency
  /** The payment the checkout already authorised with the provider. */
  readonly paymentId: string
  readonly lines: ReadonlyArray<{ readonly sku: string; readonly quantity: number; readonly unitPrice: number }>
}

export function lineTotal(line: OrderLine): Money {
  return multiply(line.unitPrice, line.quantity)
}

export function orderTotal(order: Pick<Order, 'currency' | 'lines'>): Money {
  return sum(order.lines.map(lineTotal), order.currency)
}

export class OrderStore {
  private readonly orders = new Map<string, Order>()

  get(id: string): Order | undefined {
    return this.orders.get(id)
  }

  /** Newest first. */
  list(limit: number): Order[] {
    return [...this.orders.values()].reverse().slice(0, limit)
  }

  save(order: Order): void {
    this.orders.set(order.id, order)
  }

  setStatus(id: string, status: OrderStatus): void {
    const order = this.orders.get(id)
    if (order) this.orders.set(id, { ...order, status })
  }
}

export class OrderService {
  private readonly store: OrderStore
  private readonly payments: PaymentsGateway
  private readonly now: () => Date
  private readonly idempotency = new Idempotency<Order>()

  constructor(deps: { store: OrderStore; payments: PaymentsGateway; now?: () => Date }) {
    this.store = deps.store
    this.payments = deps.payments
    this.now = deps.now ?? (() => new Date())
  }

  /** Captures the order's total against the authorised payment, then records the order. */
  place(input: NewOrder, createdBy: string, idempotencyKey: string): Promise<Order> {
    const key = `${createdBy}:${idempotencyKey}`
    return this.idempotency.run(key, async () => {
      const lines: OrderLine[] = input.lines.map((line) => ({
        id: randomUUID(),
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice, input.currency),
      }))
      const total = orderTotal({ currency: input.currency, lines })
      const { captureId } = await this.payments.capture(
        { paymentId: input.paymentId, amount: total.amount, currency: total.currency },
        `capture:${key}`,
      )
      const order: Order = {
        id: randomUUID(),
        customerId: input.customerId,
        currency: input.currency,
        lines,
        captureId,
        status: 'paid',
        createdBy,
        createdAt: this.now().toISOString(),
      }
      this.store.save(order)
      return order
    })
  }
}
