import { createHash, timingSafeEqual } from 'node:crypto'
import { verifySession } from '../../sessions.ts'
import type { AppDeps } from '../app.ts'
import { isOperator, issueToken } from '../auth.ts'
import { HttpError, type Router } from '../router.ts'
import { LoginBody, RefreshBody, parse } from '../schemas.ts'

export function sessionRoutes(router: Router, deps: AppDeps): void {
  // Exchanges an operator's API key for a session token.
  router.post('/sessions', async (ctx) => {
    const { apiKey } = parse(LoginBody, await ctx.json())
    const digest = createHash('sha256').update(apiKey).digest()
    const operator = deps.config.operators.find((op) => timingSafeEqual(op.keyHash, digest))
    if (!operator) throw new HttpError(401, 'invalid_credentials', 'unknown API key')
    return { status: 201, body: issueToken(operator.id, deps.config) }
  })

  // Exchanges a session that is still valid for a fresh one, so a console that stays open all day
  // does not have to ask for the API key again. The token comes in the body, not the header.
  router.post('/sessions/refresh', async (ctx) => {
    const { token } = parse(RefreshBody, await ctx.json())
    const claims = verifySession(token, deps.config.sessionSecret)
    if (!claims || !isOperator(claims.sub, deps.config)) {
      throw new HttpError(401, 'unauthenticated', 'the session is invalid or has expired')
    }
    return { status: 201, body: issueToken(claims.sub, deps.config) }
  })
}
