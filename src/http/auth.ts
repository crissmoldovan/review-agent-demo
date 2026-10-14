import type { IncomingMessage } from 'node:http'
import type { Config } from '../config.ts'
import { type SessionClaims, signSession, verifySession } from '../sessions.ts'
import { HttpError } from './router.ts'

/** The session behind the request's bearer token. Throws 401 unless it is valid and its operator still exists. */
export function authenticate(req: IncomingMessage, config: Config): SessionClaims {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')
  const claims = match ? verifySession(match[1], config.sessionKeys) : null
  if (!claims || !isOperator(claims.sub, config)) {
    throw new HttpError(401, 'unauthenticated', 'a valid session token is required')
  }
  return claims
}

export function issueToken(operatorId: string, config: Config): { token: string; expiresAt: string } {
  const { token, claims } = signSession(operatorId, config.sessionKeys, config.sessionTtlSeconds)
  return { token, expiresAt: new Date(claims.exp * 1000).toISOString() }
}

export function isOperator(id: string, config: Config): boolean {
  return config.operators.some((operator) => operator.id === id)
}
