/**
 * Money is always a whole number of minor units (cents, pence, yen) in one currency.
 * Nothing in this service does arithmetic on decimal amounts.
 */

export const CURRENCIES = {
  USD: { minorUnits: 2 },
  EUR: { minorUnits: 2 },
  GBP: { minorUnits: 2 },
  JPY: { minorUnits: 0 },
} as const satisfies Record<string, { minorUnits: number }>

export type Currency = keyof typeof CURRENCIES

export interface Money {
  readonly amount: number
  readonly currency: Currency
}

export function isCurrency(code: string): code is Currency {
  return Object.hasOwn(CURRENCIES, code)
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`amount must be a whole number of minor units, got ${amount}`)
  }
  return { amount, currency }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amount + b.amount, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amount - b.amount, a.currency)
}

export function multiply(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new RangeError(`factor must be a whole number, got ${factor}`)
  }
  return money(m.amount * factor, m.currency)
}

export function sum(items: readonly Money[], currency: Currency): Money {
  return items.reduce((total, item) => add(total, item), money(0, currency))
}

/**
 * Splits `total` minor units in proportion to `weights`, exactly: the parts always add up to
 * `total`, and each part is its exact proportional share rounded down or up. The units left over
 * after rounding down go to the largest fractional remainders, ties to the earliest index.
 * BigInt keeps `total * weight` exact beyond 2^53.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`cannot allocate ${total}`)
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError('weights must be non-negative whole numbers')
  }
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(weightSum)) throw new RangeError('weights are too large')
  if (weightSum === 0) {
    if (total === 0) return weights.map(() => 0)
    throw new RangeError('cannot allocate a non-zero amount over zero weights')
  }

  const bigTotal = BigInt(total)
  const bigWeightSum = BigInt(weightSum)
  const parts = weights.map((w, index) => {
    const scaled = bigTotal * BigInt(w)
    return { index, share: Number(scaled / bigWeightSum), remainder: scaled % bigWeightSum }
  })

  let leftover = total - parts.reduce((acc, part) => acc + part.share, 0)
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  for (const part of byRemainder) {
    if (leftover === 0) break
    part.share += 1
    leftover -= 1
  }
  return parts.map((part) => part.share)
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`currency mismatch: ${a.currency} and ${b.currency}`)
  }
}
