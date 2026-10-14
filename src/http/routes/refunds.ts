import type { AppDeps } from '../app.ts'
import { authenticate } from '../auth.ts'
import { HttpError, type Router, requireIdempotencyKey } from '../router.ts'
import { CreateRefundBody, parse } from '../schemas.ts'
import { serializeRefund } from '../serialize.ts'

export function refundRoutes(router: Router, deps: AppDeps): void {
  router.post('/orders/:id/refunds', async (ctx) => {
    const session = authenticate(ctx.req, deps.config)
    const idempotencyKey = requireIdempotencyKey(ctx.req)
    const { amount } = parse(CreateRefundBody, await ctx.json())
    if (!deps.orderStore.get(ctx.params.id)) {
      throw new HttpError(404, 'not_found', `order ${ctx.params.id} not found`)
    }
    const refund = await deps.refunds.refund(ctx.params.id, amount, session.sub, idempotencyKey)
    return { status: 201, body: serializeRefund(refund) }
  })

  router.get('/orders/:id/refunds', async (ctx) => {
    authenticate(ctx.req, deps.config)
    if (!deps.orderStore.get(ctx.params.id)) {
      throw new HttpError(404, 'not_found', `order ${ctx.params.id} not found`)
    }
    return { status: 200, body: { refunds: deps.refundStore.forOrder(ctx.params.id).map(serializeRefund) } }
  })
}
