# Cancel my order – `PATCH /api/orders/:id/cancel`

A customer cancels their own order while it is still `pending` or `confirmed` (BR-06). In one transaction the order becomes `cancelled`, every unit goes back into stock and the coupon use is released, then the customer is emailed.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/orders/:id/cancel { reason? }"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/orders', orderRoutes)"]
    D --> P1["router.use(protect)<br/>auth.middleware.js"]
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
    Z2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| VA["validate(cancelRules)<br/>order.validation.js"]
    VA --> VB{"reason is text, max 200?"}
    VB -->|No| E8["ApiError 400<br/>Validation failed + field errors"]
    VB -->|Yes| CT["cancelOrder<br/>order.controller.js"]
    CT --> S1["orderService.cancelMyOrder(req.user._id, id, req.body.reason)<br/>order.service.js"]
    S1 --> S2[("Order.findOne({ _id, user: userId }).select('status')")]
    S2 --> S3{Order found?}
    S3 -->|No| E9["ApiError 404<br/>Order not found"]
    S3 -->|Yes| S4{"order.isCancellableByCustomer()?<br/>status pending or confirmed"}
    S4 -->|No| E10["ApiError 400<br/>Orders that are STATUS can no longer be cancelled"]
    S4 -->|Yes| W1["cancelWithRestore(orderId, by: userId,<br/>note: reason or 'Cancelled by customer', filter: user)"]
    W1 --> T0["mongoose.startSession()<br/>session.withTransaction()"]
    T0 --> T1[("Order.findOne({ _id, user }).session(session)")]
    T1 --> T2{Order found?}
    T2 -->|No| E11["ApiError 404<br/>Order not found"]
    T2 -->|Yes| T3["order.changeStatus('cancelled', by, note)<br/>order.model.js"]
    T3 --> T4{"canTransitionTo('cancelled')?"}
    T4 -->|"No, e.g. already cancelled"| E12["ApiError 400<br/>Cannot change status from X to cancelled"]
    T4 -->|Yes| T5["status, cancelledAt, cancelReason,<br/>statusHistory.push"]
    T5 --> T6{"paymentStatus === paid?"}
    T6 -->|Yes| T7["paymentStatus = refunded"]
    T6 -->|No| T8
    T7 --> T8[("for each item: Product.releaseStock(product, qty, session)<br/>$inc stock +qty, sold -qty")]
    T8 --> T9{"order.coupon.coupon?"}
    T9 -->|Yes| T10[("Coupon.release(id, session)<br/>usedCount $gt 0, $inc usedCount -1")]
    T9 -->|No| T11
    T10 --> T11[("order.save({ session })")]
    T11 --> T12["withTransaction COMMIT<br/>finally session.endSession()"]
    T12 --> EM1[("sendOrderEmail(order)<br/>User.findById name email")]
    EM1 --> EM2["sendEmail + orderStatusTemplate<br/>emails/templates.js"]
    EM2 --> OK["sendSuccess 200<br/>Order cancelled + order"]
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
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/orders`), `server/src/modules/orders/order.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/orders/order.validation.js` (`cancelRules`), `server/src/modules/orders/order.controller.js` (`cancelOrder`), `server/src/modules/orders/order.service.js` (`cancelMyOrder`, `cancelWithRestore`, `sendOrderEmail`), `server/src/modules/orders/order.model.js` (`isCancellableByCustomer`, `canTransitionTo`, `changeStatus`), `server/src/config/constants.js` (`CUSTOMER_CANCELLABLE`, `ORDER_TRANSITIONS`), `server/src/modules/products/product.model.js` (`releaseStock`), `server/src/modules/coupons/coupon.model.js` (`release`), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (`orderStatusTemplate`), `server/src/middleware/error.middleware.js` (error response).
