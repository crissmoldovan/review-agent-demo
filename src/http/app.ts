import { type Server, createServer } from 'node:http'
import type { Config } from '../config.ts'
import type { OrderService, OrderStore } from '../orders.ts'
import { PaymentProviderError } from '../payments.ts'
import { RefundError, type RefundService, type RefundStore } from '../refunds.ts'
import { HttpError, Router } from './router.ts'
import { orderRoutes } from './routes/orders.ts'
import { refundRoutes } from './routes/refunds.ts'
import { sessionRoutes } from './routes/sessions.ts'

export interface AppDeps {
  readonly config: Config
  readonly orderStore: OrderStore
  readonly orders: OrderService
  readonly refundStore: RefundStore
  readonly refunds: RefundService
}

export function createApp(deps: AppDeps): Server {
  const router = new Router(mapDomainError)
  router.get('/health', async () => ({ status: 200, body: { ok: true } }))
  sessionRoutes(router, deps)
  orderRoutes(router, deps)
  refundRoutes(router, deps)
  return createServer((req, res) => void router.handle(req, res))
}

function mapDomainError(error: unknown): HttpError | undefined {
  if (error instanceof RefundError) return new HttpError(422, 'refund_rejected', error.message)
  if (error instanceof PaymentProviderError) return new HttpError(502, 'payment_provider_error', error.message)
  return undefined
}
