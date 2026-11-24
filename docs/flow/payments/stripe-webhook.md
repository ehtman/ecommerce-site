# Stripe webhook (payment confirmed) – `POST /api/payments/webhook`

Called by Stripe, not by a browser. The route is registered directly in `app.js` BEFORE `express.json()` and the rate limiter, so the body stays the exact raw bytes Stripe signed. After the signature check, a paid Checkout Session marks the matching CARD order as paid (atomic and idempotent) and confirms it; every other correctly signed event is acknowledged with 200 and ignored.

```mermaid
flowchart TD
    A[Stripe] -->|"POST /api/payments/webhook<br/>Stripe-Signature header"| B[Express app<br/>app.js]
    B --> C[Global middleware before the webhook<br/>helmet, cors]
    C --> D["app.post('/api/payments/webhook')<br/>express.raw type application/json<br/>req.body = Buffer, no json parse, no apiLimiter"]
    D --> CT["stripeWebhook<br/>payment.controller.js"]
    CT --> S0["paymentService.handleWebhook(req.body, stripe-signature header)<br/>payment.service.js"]
    S0 --> S1{"env.STRIPE_WEBHOOK_SECRET set?"}
    S1 -->|No| E1["ApiError 400<br/>Stripe webhooks are not configured"]
    S1 -->|Yes| S2{"signature header sent?"}
    S2 -->|No| E2["ApiError 400<br/>Missing Stripe signature"]
    S2 -->|Yes| S3["stripeGateway.constructEvent(rawBody, signature, secret)<br/>stripe.gateway.js<br/>Stripe.webhooks.constructEvent, HMAC over raw bytes"]
    S3 --> S4{Signature valid?}
    S4 -->|No| E3["ApiError 400<br/>Invalid Stripe signature"]
    S4 -->|Yes| S5{"event.type in PAYMENTS.PAID_EVENTS?<br/>checkout.session.completed or<br/>checkout.session.async_payment_succeeded"}
    S5 -->|No| N1["handled false<br/>reason ignored-event-type"]
    S5 -->|Yes| S6{"session.payment_status is paid?"}
    S6 -->|No| N2["handled false<br/>reason not-paid-yet"]
    S6 -->|Yes| M0["markOrderPaid(session)"]
    M0 --> M1["lookups = paymentResult.sessionId equals session.id<br/>plus _id = metadata.orderId if isObjectIdOrHexString"]
    M1 --> M2[("Order.findOne({ $or: lookups, paymentMethod: CARD })")]
    M2 --> M3{Order found?}
    M3 -->|No| N3["handled false<br/>reason order-not-found"]
    M3 -->|Yes| M4{"paymentStatus already paid?"}
    M4 -->|Yes| N4["handled false<br/>reason already-paid"]
    M4 -->|No| M5{"amount_total equals toMinorUnits(totalPrice)<br/>and currency is pkr?"}
    M5 -->|No| N5["console.error amount mismatch<br/>handled false<br/>reason amount-mismatch"]
    M5 -->|Yes| M6[("Order.findOneAndUpdate<br/>filter _id + paymentStatus pending<br/>$set paymentStatus paid, paidAt,<br/>paymentResult provider, sessionId, paymentIntentId, paidAt<br/>new: true")]
    M6 --> M7{"claimed?<br/>null if another delivery won the race"}
    M7 -->|No| N4
    M7 -->|Yes| M8{"claimed.status is pending?"}
    M8 -->|No| N6["console.warn paid after cancel<br/>handled true<br/>reason paid-after-cancel"]
    M8 -->|Yes| M9["claimed.changeStatus(CONFIRMED,<br/>note Card payment received)<br/>order.model.js"]
    M9 --> M10[("claimed.save()")]
    M10 --> M11["sendOrderEmail(claimed, 'confirmation')<br/>order.service.js"]
    M11 --> M12[("User.findById(order.user)<br/>select name email")]
    M12 --> M13["sendEmail + orderConfirmationTemplate<br/>emails/sendEmail.js, emails/templates.js"]
    M13 --> N7["handled true<br/>reason paid"]
    N1 --> OK["sendSuccess 200 Webhook received<br/>received true + result summary + type"]
    N2 --> OK
    N3 --> OK
    N4 --> OK
    N5 --> OK
    N6 --> OK
    N7 --> OK
    OK --> R[Stripe stops retrying]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    EH -->|"JSON { success: false, message }"| R2[Stripe retries later]
```

**Files involved:** `server/src/app.js` (registers the webhook with `express.raw()` before `express.json()` and `apiLimiter`), `server/src/modules/payments/payment.controller.js` (`stripeWebhook`), `server/src/modules/payments/payment.service.js` (`handleWebhook`, `markOrderPaid`, `toMinorUnits`), `server/src/modules/payments/stripe.gateway.js` (`constructEvent`), `server/src/modules/orders/order.model.js` (`changeStatus`), `server/src/modules/orders/order.service.js` (`sendOrderEmail`), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (`orderConfirmationTemplate`), `server/src/config/env.js` (`STRIPE_WEBHOOK_SECRET`), `server/src/config/constants.js` (`PAYMENTS.PAID_EVENTS`, `PAYMENTS.CURRENCY`, `PAYMENT_STATUS`, `ORDER_STATUS`), `server/src/middleware/error.middleware.js` (error response).
