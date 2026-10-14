import { loadConfig } from './config.ts'
import { createApp } from './http/app.ts'
import { OrderService, OrderStore } from './orders.ts'
import { PaymentsClient } from './payments.ts'
import { RefundService, RefundStore } from './refunds.ts'

const config = loadConfig()
const payments = new PaymentsClient(config.payments)
const orderStore = new OrderStore()
const refundStore = new RefundStore()

const app = createApp({
  config,
  orderStore,
  orders: new OrderService({ store: orderStore, payments }),
  refundStore,
  refunds: new RefundService({ orders: orderStore, refunds: refundStore, payments }),
})

app.listen(config.port, () => {
  console.log(`orders-api listening on port ${config.port}`)
})
