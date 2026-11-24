# Update order status (admin) – `PATCH /api/admin/orders/:id/status`

An admin moves an order along the state machine (BR-08). Cancelling runs a transaction that restores stock and the coupon use and marks a paid order as refunded; shipping needs a tracking number; delivering a Cash on Delivery order marks it paid. The customer is emailed about every change except `processing`. Since branch 10 the route lives in the admin router (`admin.routes.js`) and reuses the orders module's controller; the URL is unchanged. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/admin/orders/:id/status"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin', adminRoutes)"]
    D --> G0["router.use(protect, authorize(ROLES.ADMIN))<br/>admin.routes.js, guards every admin route"]
    G0 --> P1["protect<br/>auth.middleware.js"]
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
    P7 -->|No| Z1["authorize(ROLES.ADMIN)<br/>auth.middleware.js"]
    Z1 --> Z2{role is admin?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| V1["validate(statusRules)<br/>order.validation.js"]
    V1 --> V2{"statusRules pass?<br/>status: one of ORDER_STATUS<br/>note: optional text, max 200<br/>trackingNumber: optional text, max 50"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V2 -->|Yes| CT["orders.adminUpdateStatus<br/>order.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["orderService.adminUpdateStatus(req.user._id, req.params.id, req.body)<br/>order.service.js"]
    S1 --> S2{"status is cancelled?"}
    S2 -->|Yes| C1[("Order.findById(id).select status")]
    C1 --> C2{Order found?}
    C2 -->|No| E8["ApiError 404<br/>Order not found"]
    C2 -->|Yes| C3{"current.canTransitionTo(cancelled)?<br/>ORDER_TRANSITIONS"}
    C3 -->|No| E9["ApiError 400<br/>Cannot change status from X to cancelled"]
    C3 -->|Yes| T0["cancelWithRestore(id, by admin, note or Cancelled by store)"]
    T0 --> T1[("mongoose.startSession()<br/>session.withTransaction")]
    T1 --> T2[("Order.findOne({ _id }).session(session)")]
    T2 --> T3{Order found?}
    T3 -->|No| E10["ApiError 404<br/>Order not found<br/>transaction aborted"]
    T3 -->|Yes| T4["order.changeStatus(cancelled)<br/>cancelledAt, cancelReason, statusHistory.push"]
    T4 --> T5{"paymentStatus paid?"}
    T5 -->|Yes| T6["paymentStatus = refunded<br/>refund itself is done in Stripe"]
    T5 -->|No| T7
    T6 --> T7[("for each item: Product.releaseStock<br/>$inc stock +qty, sold -qty, in session")]
    T7 --> T8{"order.coupon.coupon set?"}
    T8 -->|Yes| T9[("Coupon.release<br/>$inc usedCount -1 when above 0, in session")]
    T8 -->|No| T10
    T9 --> T10[("order.save({ session })<br/>commit, then session.endSession()")]
    T10 --> M1
    S2 -->|No| N1[("Order.findById(id)")]
    N1 --> N2{Order found?}
    N2 -->|No| E11["ApiError 404<br/>Order not found"]
    N2 -->|Yes| N3{"status shipped<br/>without trackingNumber?"}
    N3 -->|Yes| E12["ApiError 400<br/>Tracking number is required when shipping"]
    N3 -->|No| N4["order.changeStatus(status, by, note, trackingNumber)<br/>order.model.js"]
    N4 --> N5{"canTransitionTo(status)?"}
    N5 -->|No| E13["ApiError 400<br/>Cannot change status from X to Y"]
    N5 -->|Yes| N6["set status and trackingNumber<br/>delivered: deliveredAt, COD becomes paid + paidAt<br/>statusHistory.push"]
    N6 --> N7[("order.save()")]
    N7 --> N8{"status is processing?"}
    N8 -->|"Yes, internal step, no email"| OK
    N8 -->|No| M1["sendOrderEmail(order)<br/>order.service.js"]
    M1 --> M2[("User.findById(order.user).select name email")]
    M2 --> M3{User still exists?}
    M3 -->|No| OK
    M3 -->|Yes| M4["sendEmail to user.email<br/>orderStatusTemplate(name, order)<br/>emails/templates.js"]
    M4 --> OK["sendSuccess 200<br/>Order marked as new status + order"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    EV --> EH
    E8 --> EH
    E9 --> EH
    E10 --> EH
    E11 --> EH
    E12 --> EH
    E13 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/orders/order.validation.js` (`statusRules`), `server/src/modules/orders/order.controller.js` (`adminUpdateStatus`), `server/src/modules/orders/order.service.js` (`adminUpdateStatus`, `cancelWithRestore`, `sendOrderEmail`), `server/src/modules/orders/order.model.js` (`canTransitionTo`, `changeStatus`), `server/src/config/constants.js` (`ORDER_STATUS`, `ORDER_TRANSITIONS`, `PAYMENT_STATUS`), `server/src/modules/products/product.model.js` (`releaseStock`), `server/src/modules/coupons/coupon.model.js` (`release`), `server/src/emails/sendEmail.js`, `server/src/emails/templates.js` (`orderStatusTemplate`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
