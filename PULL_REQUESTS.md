# The demo pull requests

Six branches, each opened as a pull request against `main`, give review-agent's documentation real reviews to
show. All but one carry a deliberate defect, planted to be found by reading the code. They are listed here with the
description each pull request is opened with, and the review tier the documentation uses it for. What a careful
reviewer should find is in the [answer key](#answer-key) at the bottom.

**Keep this file out of the branches.** Every branch starts from the baseline commit `7f628bf`, before this file
existed. review-agent reads the whole repository at a pull request's head, so a branch that contained this file
would hand the reviewer its own answer key. Do not merge or rebase `main` into these branches.

| # | Branch | Pull request | Documentation uses it for |
|---|---|---|---|
| 1 | `feat/order-notes` | Add optional notes to orders | `basic`: a review that finds nothing |
| 2 | `feat/currency-display` | Show formatted totals in order responses | `basic` |
| 3 | `fix/refund-rounding` | Round each line's share of a partial refund on its own | `normal` |
| 4 | `feat/session-rotation` | Rotate the session signing key without logging anyone out | `thorough`, and the multi-reviewer mode |
| 5 | `chore/bump-zod` | Bump zod from 4.6.2 to 4.6.3 | the release-only skip: no automatic review |
| 6 | `feat/retry-backoff` | Back off exponentially between payment retries and honour Retry-After | a re-review: "No longer reported" |

## 1. Add optional notes to orders

Branch `feat/order-notes`, one commit. Documentation: `basic`, the automatic review.

> Operators have been asking for somewhere to put delivery instructions on an order. This adds an optional `notes`
> field to `POST /orders`.
>
> - Free text, trimmed, at most 500 characters. Notes that are only whitespace are dropped.
> - Returned on the order detail (`POST /orders`, `GET /orders/:id`) as `notes`, `null` when there are none.
> - Not in the `GET /orders` list, which stays a summary.
>
> Tests cover the trimming, the blank case and the length limit.

## 2. Show formatted totals in order responses

Branch `feat/currency-display`, one commit. Documentation: `basic`, the automatic review.

> The console formats money itself and gets the thousands separators wrong in a couple of places. This moves the
> formatting to the server: every order response now carries `totalDisplay`, such as `"$1,234.50"`, next to the
> integer `total`, so the console can drop its own formatter.
>
> `formatMoney()` is in `src/format.ts`, en-US style, with tests.

## 3. Round each line's share of a partial refund on its own

Branch `fix/refund-rounding`, one commit. Documentation: `normal`, asked for with `/review --tier normal`.

> Finance reconciles refunds line by line and asked that each line's refund can be worked out from that line alone.
> Today `allocate()` hands the leftover minor units to whichever lines have the largest remainders, so a line's
> refund depends on its neighbours.
>
> This gives each line its own proportional share instead, rounded to the nearest minor unit:
> `round(amount × remaining ÷ outstanding)`. The rounding differences cancel out across the lines, so the sum always
> equals the refund; there is a test for it. Nothing changes in how much can be refunded or in the call to the
> provider.

## 4. Rotate the session signing key without logging anyone out

Branch `feat/session-rotation`, one commit. Documentation: `thorough` (`/review --tier thorough`), and the
multi-reviewer mode (review-agent's 0.2.0 design, §8.3, `--multi`; not built in 0.1.3).

> We need to be able to rotate the session secret, and today changing `SESSION_SECRET` logs every operator out. This
> adds a keyring:
>
> - Tokens now carry the id of the key that signed them: `<key id>.<payload>.<signature>`.
> - `SESSION_KEYS` takes `id:secret` pairs, current key first. New tokens are signed with the current key; tokens
>   signed with a previous key keep working until they expire.
> - To rotate: put the new key first, keep the old one second, and remove it once its tokens have expired.
> - A deployment that only sets `SESSION_SECRET` keeps working, as a single key with the id `default`.
>   `signSession` and `verifySession` still accept a bare secret, so existing callers did not need to change.
>
> Tests cover the key id in the token, accepting a token signed with the previous key, and rejecting one whose key
> has been removed.

## 5. Bump zod from 4.6.2 to 4.6.3

Branch `chore/bump-zod`, one commit, `package.json` and `pnpm-lock.yaml` only. Documentation: the release-only skip.

> Patch release of zod. `package.json` and the lock file only.

## 6. Back off exponentially between payment retries and honour Retry-After

Branch `feat/retry-backoff`, two commits. Documentation: a re-review.

Open the pull request with only the first commit, `c9292b1`, on the branch and capture the first review. Then push
the second, `6494f0c`, the developer's fix, and ask for `/review` to capture the re-review.

> A fixed 250 ms between attempts hammers the payment provider when it is struggling, and we ignore the
> `Retry-After` it sends with a 429.
>
> - Backoff is exponential with full jitter: up to `baseDelayMs × 2^(n−1)` after the n-th failed attempt, capped at
>   `maxDelayMs` (5 s).
> - When the provider sends `Retry-After` (in seconds, the only form it uses) we wait that long instead, also capped.
> - `maxAttempts` stays 3. `retryDelayMs` is renamed `baseDelayMs`; nothing in the repository set it.

## Answer key

What a careful reviewer should find, at each branch's head unless a commit is named. `path:line` is at that commit.
The categories are review-agent's (intent, correctness, impact, security). The severities are our estimate of a fair
score out of 10, not output captured from any reviewer. Every defect below was confirmed by running the code locally
before this file was written.

### 1. `feat/order-notes`: nothing

Nothing should be reported. Two things a reviewer may mention are deliberate and stated: notes are absent from the
`GET /orders` summary (the description says so), and whitespace-only notes are dropped by
`notes: input.notes || undefined` at `src/orders.ts:102` (commented, and tested). A finding beyond those is a false
positive.

### 2. `feat/currency-display`

| Category | Severity | Where | What |
|---|---|---|---|
| correctness | 5–6 | `src/format.ts:16–17` | Every amount is divided by 100 and printed with two decimals, whatever the currency. JPY has no minor unit (`src/money.ts:10`; the README says `1250` is ¥1,250), so a JPY order totalling 3700 shows `"¥37.00"` instead of `"¥3,700"`. The tests (`test/format.test.ts`) cover only two-decimal currencies. Fix: take the divisor and the fraction digits from `CURRENCIES[m.currency].minorUnits`, or use `Intl.NumberFormat` with `style: 'currency'`. |
| intent, impact | 3 | `src/http/serialize.ts:30–39`, called from `src/http/routes/orders.ts:22` | The description says every order response carries `totalDisplay`, but `GET /orders` builds its rows with `serializeOrderSummary`, which was left unchanged. The order list, where the console shows the most totals, still has none, so the console cannot drop its formatter. |

### 3. `fix/refund-rounding`

| Category | Severity | Where | What |
|---|---|---|---|
| correctness | 7–8 | `src/refunds.ts:61` | Rounding each line's share on its own means the lines no longer add up to the refund. Three lines of 1000 with a refund of 100 give 33 + 33 + 33 = 99. Two lines of 1000 with a refund of 1001 give 501 + 501 = 1002. The provider is still asked for `plan.total` (`:112`), so the money moved and the per-line record disagree, which breaks the documented invariant "Always the sum of `lines`" (`:16`). |
| intent | 5–6 | `src/refunds.ts:60`; description | "The rounding differences cancel out across the lines, so the sum always equals the refund" is false (see above). The new test (`test/refunds.test.ts:33`) checks one input, 1001 over 1000 and 3000, where it happens to hold. |
| correctness, impact | 6–7 | `src/refunds.ts:51` against `:56` | The drift compounds. What is still refundable is computed from refund totals (`:51`), but each line's remaining amount is computed from the recorded lines (`:56`). After the 1001 refund above, refunding the 999 still allowed records 500 on each line, so each 1000 line has now been refunded 1001: more than it cost, which the doc comment at `:45` promises cannot happen. |

The right fix is to keep `allocate()` (`src/money.ts:58`), which is exact. If finance needs to recompute a line on
its own, the largest-remainder rule can be documented for them.

### 4. `feat/session-rotation`

| Category | Severity | Where | What |
|---|---|---|---|
| security | 8–9 | `src/sessions.ts:55–59` | A token signed with a previous key is returned by `decodeClaims(payload)` without checking `exp`, so it never expires while its key stays in `previous`. Running the code, a token with a 60-second lifetime is still accepted ten days later. This contradicts the module comment (`:9`) and `Keyring.previous` (`:27`), which both say "until they expire". |
| security | 3–4 | `src/sessions.ts:58` | The same path compares signatures with `!==`. The current-key path (`:65`) and the baseline use the constant-time `timingSafeEqual`. |
| impact, correctness | 6 | `src/http/routes/sessions.ts:22` (not in the diff) | `POST /sessions/refresh` still calls `verifySession(token, deps.config.sessionSecret)`. The compatibility shim (`Keys = Keyring \| string`, `src/sessions.ts:32`; `toKeyring`, `:72–73`) turns that string into a keyring whose only key has the id `default`, so once `SESSION_KEYS` is set every refresh answers 401: real tokens carry the real key's id. It still compiles because `config.sessionSecret` was kept as deprecated (`src/config.ts:13–14, 28`), and it works when only `SESSION_SECRET` is set, which is why tests and a quick manual check pass. Confirmed with a local run. Fix: verify with `deps.config.sessionKeys`, and drop the shim and `sessionSecret`. |
| intent | 3–4 | `src/sessions.ts:51`; description | "Without logging anyone out" does not hold for the deploy itself. Tokens issued before it have two parts (`<payload>.<signature>`), and `verifySession` now requires three, so every operator signed in at deploy time is logged out once. Confirmed by checking a baseline-format token against the branch. Fix: accept a two-part token as signed by `default`, for one token lifetime. |

The first finding is the one the `thorough` and multi-reviewer captures should not miss. The third is the one that
shows the value of reading the whole repository rather than the diff alone.

### 5. `chore/bump-zod`: no automatic review

Both changed files, `package.json` and `pnpm-lock.yaml`, are on review-agent's release-only list
(`packages/app/src/decide.ts`, `isReleaseOnly`), so the automatic review is skipped. A `/review` comment still reviews
it, and should find nothing. The two zod integrity hashes were copied from lock files pnpm generated elsewhere; they
were not re-checked against the registry here. The lock file is abridged to direct dependencies (see the README), so a reviewer may remark on that; it
is not a defect of this pull request.

### 6. `feat/retry-backoff`

| Commit | Category | Severity | Where | What |
|---|---|---|---|---|
| `c9292b1` | correctness | 5–6 | `src/payments.ts:99` | The loop gives up only when `attempt > this.maxAttempts`, so it makes `maxAttempts + 1` attempts: 4 with the default of 3, and 2 when `maxAttempts` is 1. `maxAttempts` is documented as "Attempts per call, the first one included" (`:24`), and the baseline made exactly that many. Every extra attempt is one more request to the payment provider, plus up to `maxDelayMs` of waiting. The Idempotency-Key keeps it from refunding twice. Confirmed by counting calls against a provider that always answers 503. |
| `6494f0c` | (re-review) | | `src/payments.ts:99–104` | The fix wraps the old check in `if (attempt < this.maxAttempts)` and throws at `:104` once attempts run out. The original line is still there at `:100`, re-indented, but its `attempt > this.maxAttempts` half can no longer be true. The re-review should report the finding above as **no longer present**, even though the line it pointed at survives. It may mention the dead comparison at `:100` as a tidy-up (severity 1–2). The new test `test/payments.test.ts:59` pins three attempts. |
