import type { AppDeps } from '../app.ts'
import { authenticate } from '../auth.ts'
import { HttpError, type Router, requireIdempotencyKey } from '../router.ts'
import { CreateOrderBody, parse } from '../schemas.ts'
import { serializeOrder, serializeOrderSummary } from '../serialize.ts'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function orderRoutes(router: Router, deps: AppDeps): void {
  router.post('/orders', async (ctx) => {
    const session = authenticate(ctx.req, deps.config)
    const idempotencyKey = requireIdempotencyKey(ctx.req)
    const input = parse(CreateOrderBody, await ctx.json())
    const order = await deps.orders.place(input, session.sub, idempotencyKey)
    return { status: 201, body: serializeOrder(order) }
  })

  router.get('/orders', async (ctx) => {
    authenticate(ctx.req, deps.config)
    const limit = parseLimit(ctx.url.searchParams.get('limit'))
    return { status: 200, body: { orders: deps.orderStore.list(limit).map(serializeOrderSummary) } }
  })

  router.get('/orders/:id', async (ctx) => {
    authenticate(ctx.req, deps.config)
    const order = deps.orderStore.get(ctx.params.id)
    if (!order) throw new HttpError(404, 'not_found', `order ${ctx.params.id} not found`)
    return { status: 200, body: serializeOrder(order) }
  })
}

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new HttpError(400, 'invalid_limit', `limit must be a whole number from 1 to ${MAX_LIMIT}`)
  }
  return limit
}
