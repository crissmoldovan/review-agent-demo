import { describe, expect, it } from 'vitest'
import { formatMoney } from '../src/format.ts'
import { money } from '../src/money.ts'

describe('formatMoney', () => {
  it('formats dollars and cents with thousands separators', () => {
    expect(formatMoney(money(123450, 'USD'))).toBe('$1,234.50')
  })

  it('formats euros and pounds', () => {
    expect(formatMoney(money(1200, 'EUR'))).toBe('€12.00')
    expect(formatMoney(money(99, 'GBP'))).toBe('£0.99')
  })

  it('puts the sign before the symbol', () => {
    expect(formatMoney(money(-1200, 'EUR'))).toBe('-€12.00')
  })
})
