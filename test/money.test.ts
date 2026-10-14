import { describe, expect, it } from 'vitest'
import { add, allocate, money, sum } from '../src/money.ts'

describe('money', () => {
  it('refuses fractional minor units', () => {
    expect(() => money(10.5, 'USD')).toThrow(RangeError)
  })

  it('refuses to add different currencies', () => {
    expect(() => add(money(100, 'USD'), money(100, 'EUR'))).toThrow(TypeError)
  })

  it('sums in one currency', () => {
    expect(sum([money(150, 'GBP'), money(250, 'GBP')], 'GBP')).toEqual(money(400, 'GBP'))
  })
})

describe('allocate', () => {
  it('splits exactly, giving the leftover to the earliest of equal remainders', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
  })

  it('splits in proportion to the weights', () => {
    expect(allocate(1000, [1000, 3000])).toEqual([250, 750])
  })

  it('gives nothing to a zero weight', () => {
    expect(allocate(5, [0, 10])).toEqual([0, 5])
  })

  it('stays exact beyond 2^53', () => {
    const parts = allocate(9_000_000_000_000, [3_000_000, 3_000_001])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_000_000_000_000)
  })

  it('refuses to spread an amount over nothing', () => {
    expect(() => allocate(1, [0, 0])).toThrow(RangeError)
  })
})
