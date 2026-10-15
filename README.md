# orders-api

A small HTTP API for a shop's back office: operators place orders, the API captures their payment with a payment
provider, and operators refund them in full or in part. TypeScript on Node.js 22, `node:http`, no framework.

**This is a demo repository.** It exists so that the documentation of
[review-agent](https://github.com/crissmoldovan/review-agent), an AI pull-request reviewer, can show real reviews of
real pull requests. It is small on purpose, it is not production software, and everything it stores lives in memory
and is gone when the process stops. The payment provider it calls is fictional.

The pull requests opened against it, and what a careful review of each should find, are in
[PULL_REQUESTS.md](PULL_REQUESTS.md). That file is on `main` only, never on a pull request's branch.

## Endpoints

| Method and path | What it does |
|---|---|
| `POST /sessions` | exchanges an operator's API key for a session token |
| `POST /sessions/refresh` | exchanges a session token that is still valid for a fresh one |
| `POST /orders` | places an order and captures its total (needs `Idempotency-Key`) |
| `GET /orders` | lists orders, newest first, as summaries (`?limit=`, 1–100, default 20) |
| `GET /orders/:id` | one order with its lines |
| `POST /orders/:id/refunds` | refunds part or all of an order (needs `Idempotency-Key`) |
| `GET /orders/:id/refunds` | the refunds made on an order |
| `GET /health` | liveness |

Everything except `/sessions`, `/sessions/refresh` and `/health` needs `Authorization: Bearer <session token>`.
Request shapes are in [`src/http/schemas.ts`](src/http/schemas.ts).

## Money

Every amount, in requests, responses and code, is a whole number of the currency's minor unit: `1250` is
12.50 USD, and `1250` is ¥1,250. Nothing does arithmetic on decimals. [`src/money.ts`](src/money.ts) holds the
currencies and their minor units, and `allocate`, which splits an amount in proportion to weights without losing or
inventing a minor unit. Refunds use it to spread a partial refund across an order's lines.

## Running it

```sh
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
pnpm start
```

`pnpm-lock.yaml` lists the direct dependencies only, which is why the install above does not freeze it.

| Variable | Required | What |
|---|---|---|
| `SESSION_SECRET` | unless `SESSION_KEYS` is set | signs session tokens; at least 32 characters |
| `SESSION_KEYS` | no | `id:secret` pairs separated by commas, current key first, each secret at least 32 characters. To rotate, put a new key first and keep the old one after it until its tokens have expired |
| `SESSION_TTL_SECONDS` | no | session lifetime, default 3600 |
| `OPERATOR_KEYS` | yes | `id:sha256hex` pairs separated by commas: each operator's id and the SHA-256 of their API key |
| `PAYMENTS_BASE_URL` | yes | the payment provider's API |
| `PAYMENTS_API_KEY` | yes | the key the provider issued to this service |
| `PORT` | no | default 3000 |

## Layout

| Path | What |
|---|---|
| `src/money.ts` | currencies, integer money, `allocate` |
| `src/orders.ts` | orders, their totals, placing one |
| `src/refunds.ts` | planning a refund across lines, and executing it |
| `src/sessions.ts` | signing and verifying session tokens (HMAC-SHA256) |
| `src/payments.ts` | the payment provider's client, with retries |
| `src/config.ts` | configuration from the environment |
| `src/http/` | the router, authentication, request schemas, response shapes, routes |
| `test/` | vitest tests |

## Licence

[Apache-2.0](LICENSE).
