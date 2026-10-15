import type { Currency, Money } from './money.ts'

const SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
} as const satisfies Record<Currency, string>

/**
 * An amount as a person reads it, such as "$1,234.50" or "-€12.00", for showing in the console.
 * Responses keep the integer amount alongside it; nothing should parse this string back.
 */
export function formatMoney(m: Money): string {
  const sign = m.amount < 0 ? '-' : ''
  const major = Math.abs(m.amount) / 100
  const digits = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}${SYMBOLS[m.currency]}${digits}`
}
