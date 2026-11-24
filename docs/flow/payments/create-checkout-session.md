# Create a Stripe checkout session – `POST /api/payments/checkout-session`

A logged-in customer with a verified email sends the id of one of their own CARD orders and gets back the URL of a Stripe-hosted payment page. The amount is never taken from the client: the server reads `totalPrice` from the order. Admins get 403, and the route answers 400 while card payments are switched off.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/payments/checkout-session"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/payments', paymentRoutes)"]
    D --> P1["protect<br/>auth.middleware.js"]
    P1 --> P2{"Bearer token<br/>in header?"}
    P2 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P2 -->|Yes| P3{"jwt.verify OK?"}
    P3 -->|No| E2["ApiError 401<br/>token invalid or expired"]
    P3 -->|Yes| P4[("User.findById(payload.id)")]
    P4 --> P5{User exists?}
    P5 -->|No| E3["ApiError 401<br/>user no longer exists"]
    P5 -->|Yes| P6{user.isActive?}
    P6 -->|No| E4["ApiError 403<br/>Account disabled"]
    P6 -->|Yes| P7{"user.isTokenOutdated(payload.v)?"}
    P7 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P7 -->|No| Z1["authorize(ROLES.CUSTOMER)<br/>auth.middleware.js"]
    Z1 --> Z2{role is customer?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| RV1["requireVerifiedEmail<br/>auth.middleware.js"]
    RV1 --> RV2{isEmailVerified?}
    RV2 -->|No| E7["ApiError 403<br/>Please verify your email address to continue"]
    RV2 -->|Yes| V1["validate(checkoutSessionRules)<br/>payment.validation.js"]
    V1 --> V2{"body.orderId isMongoId?"}
    V2 -->|No| E8["ApiError 400<br/>Validation failed<br/>Invalid order"]
    V2 -->|Yes| CT["createCheckoutSession<br/>payment.controller.js"]
    CT --> S0["paymentService.createCheckoutSession(req.user, req.body.orderId)<br/>payment.service.js"]
    S0 --> S1["assertCardPaymentsReady()"]
    S1 --> S2{"env.PAYMENT_CARD_ENABLED and<br/>stripeGateway.isConfigured()?"}
    S2 -->|No| E9["ApiError 400<br/>Card payments are not configured"]
    S2 -->|Yes| S3[("Order.findOne({ _id: orderId, user: user._id })")]
    S3 --> S4{Order found?}
    S4 -->|No| E10["ApiError 404<br/>Order not found"]
    S4 -->|Yes| S5{"paymentMethod is CARD?"}
    S5 -->|No| E11["ApiError 400<br/>This order is not a card order"]
    S5 -->|Yes| S6{"paymentStatus is paid?"}
    S6 -->|Yes| E12["ApiError 400<br/>This order is already paid"]
    S6 -->|No| S7{"status is pending?"}
    S7 -->|No| E13["ApiError 400<br/>This order can no longer be paid"]
    S7 -->|Yes| S8{"isPaymentWindowOver(order)<br/>older than 30 min?"}
    S8 -->|Yes| E14["ApiError 400<br/>The time to pay for this order is over, please order again"]
    S8 -->|No| ST1["stripeGateway.createCheckoutSession(params)<br/>stripe.gateway.js<br/>mode payment, customer_email, one line item<br/>unit_amount = toMinorUnits(totalPrice), currency pkr<br/>client_reference_id + metadata.orderId<br/>success_url and cancel_url on FRONTEND_URL"]
    ST1 --> ST2[["Stripe API<br/>checkout.sessions.create"]]
    ST2 --> ST3{Stripe call succeeded?}
    ST3 -->|No| E15["ApiError 502<br/>Could not reach the payment provider, please try again"]
    ST3 -->|Yes| S9["order.paymentResult =<br/>provider stripe + sessionId"]
    S9 --> S10[("order.save()")]
    S10 --> OK["sendSuccess 200 Checkout session created<br/>url + sessionId"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    E9 --> EH
    E10 --> EH
    E11 --> EH
    E12 --> EH
    E13 --> EH
    E14 --> EH
    E15 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/payments`), `server/src/modules/payments/payment.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`, `requireVerifiedEmail`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/payments/payment.validation.js` (`checkoutSessionRules`), `server/src/modules/payments/payment.controller.js` (`createCheckoutSession`), `server/src/modules/payments/payment.service.js` (`createCheckoutSession`, `assertCardPaymentsReady`, `isPaymentWindowOver`, `toMinorUnits`), `server/src/modules/payments/stripe.gateway.js` (`isConfigured`, `createCheckoutSession`), `server/src/config/env.js` (`PAYMENT_CARD_ENABLED`, `STRIPE_SECRET_KEY`, `FRONTEND_URL`), `server/src/config/constants.js` (`PAYMENTS`, `PAYMENT_METHODS`, `PAYMENT_STATUS`, `ORDER_STATUS`), `server/src/middleware/error.middleware.js` (error response).
