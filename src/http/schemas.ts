import { z } from 'zod'
import { CURRENCIES, type Currency } from '../money.ts'
import { HttpError } from './router.ts'

const currencies = Object.keys(CURRENCIES) as [Currency, ...Currency[]]

export const LoginBody = z.strictObject({
  apiKey: z.string().min(1).max(256),
})

export const RefreshBody = z.strictObject({
  token: z.string().min(1).max(4096),
})

/** Prices are whole minor units. The limits keep every order total far below 2^53. */
export const CreateOrderBody = z.strictObject({
  customerId: z.string().trim().min(1).max(64),
  currency: z.enum(currencies),
  paymentId: z.string().trim().min(1).max(128),
  lines: z
    .array(
      z.strictObject({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(1000),
        unitPrice: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(100),
  notes: z.string().trim().max(500).optional(),
})

export const CreateRefundBody = z.strictObject({
  amount: z.number().int().positive(),
})

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(body)'}: ${issue.message}`)
      .join('; ')
    throw new HttpError(400, 'invalid_request', detail)
  }
  return result.data
}
