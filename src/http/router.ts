import type { IncomingMessage, ServerResponse } from 'node:http'

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface Context {
  readonly req: IncomingMessage
  readonly url: URL
  readonly params: Readonly<Record<string, string>>
  json(): Promise<unknown>
}

export interface Reply {
  readonly status: number
  readonly body?: unknown
}

export type Handler = (ctx: Context) => Promise<Reply>

/** Turns an error thrown by a handler into the HTTP error it means, or undefined for a 500. */
export type ErrorMapper = (error: unknown) => HttpError | undefined

interface Route {
  readonly method: string
  readonly pattern: RegExp
  readonly keys: readonly string[]
  readonly handler: Handler
}

const MAX_BODY_BYTES = 64 * 1024

export class Router {
  private readonly routes: Route[] = []
  private readonly mapError: ErrorMapper

  constructor(mapError: ErrorMapper = () => undefined) {
    this.mapError = mapError
  }

  get(path: string, handler: Handler): void {
    this.add('GET', path, handler)
  }

  post(path: string, handler: Handler): void {
    this.add('POST', path, handler)
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let reply: Reply
    try {
      reply = await this.dispatch(req)
    } catch (error) {
      const known = error instanceof HttpError ? error : this.mapError(error)
      if (!known) console.error(error)
      reply = known
        ? { status: known.status, body: { error: known.code, message: known.message } }
        : { status: 500, body: { error: 'internal', message: 'internal error' } }
    }
    const payload = reply.body === undefined ? '' : JSON.stringify(reply.body)
    res.writeHead(reply.status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }

  private add(method: string, path: string, handler: Handler): void {
    const keys: string[] = []
    const source = path.replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key)
      return '([^/]+)'
    })
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler })
  }

  private async dispatch(req: IncomingMessage): Promise<Reply> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathMatched = false
    for (const route of this.routes) {
      const match = route.pattern.exec(url.pathname)
      if (!match) continue
      pathMatched = true
      if (route.method !== req.method) continue
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeParam(match[i + 1])]))
      return route.handler({ req, url, params, json: () => readJson(req) })
    }
    throw pathMatched
      ? new HttpError(405, 'method_not_allowed', `${req.method} is not allowed on ${url.pathname}`)
      : new HttpError(404, 'not_found', `no route for ${url.pathname}`)
  }
}

/** The request's Idempotency-Key header, which every POST that moves money must carry. */
export function requireIdempotencyKey(req: IncomingMessage): string {
  const key = req.headers['idempotency-key']
  if (typeof key !== 'string' || !/^[\w.:-]{1,128}$/.test(key)) {
    throw new HttpError(400, 'idempotency_key_required', 'send an Idempotency-Key header of 1 to 128 characters')
  }
  return key
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new HttpError(400, 'invalid_path', 'the path is not valid percent-encoding')
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'payload_too_large', `request bodies are limited to ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json', 'the request body is not valid JSON')
  }
}
