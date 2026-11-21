# Update order status (admin) – `PATCH /api/admin/orders/:id/status`

An admin moves an order along the state machine (BR-08): pending → confirmed → processing → shipped → delivered, or to cancelled before shipping. Cancelling restores stock and the coupon use in a transaction; shipping needs a tracking number; delivering a COD order marks it paid. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/admin/orders/:id/status { status, note?, trackingNumber? }"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin/orders', adminOrderRoutes)"]
    D --> P1["adminOrderRoutes.use(protect)<br/>auth.middleware.js"]
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
    O2 -->|Yes| VA["validate(statusRules)<br/>order.validation.js"]
    VA --> VB{"status in ORDER_STATUS, note max 200,<br/>trackingNumber max 50?"}
    VB -->|No| E8["ApiError 400<br/>Validation failed + field errors"]
    VB -->|Yes| CT["adminUpdateStatus<br/>order.controller.js"]
    CT --> S1["orderService.adminUpdateStatus(req.user._id, id, req.body)<br/>order.service.js"]
    S1 --> S2{"status === cancelled?"}

    S2 -->|Yes| X1[("Order.findById(id).select('status')")]
    X1 --> X2{Order found?}
    X2 -->|No| E9["ApiError 404<br/>Order not found"]
    X2 -->|Yes| X3{"current.canTransitionTo('cancelled')?"}
    X3 -->|No| E10["ApiError 400<br/>Cannot change status from X to cancelled"]
    X3 -->|Yes| W1["cancelWithRestore(id, by: adminId,<br/>note: note or 'Cancelled by store')"]
    W1 --> T0["mongoose.startSession()<br/>session.withTransaction()"]
    T0 --> T1[("Order.findOne({ _id }).session(session)")]
    T1 --> T2{Order found?}
    T2 -->|No| E11["ApiError 404<br/>Order not found"]
    T2 -->|Yes| T3["order.changeStatus('cancelled', by, note)<br/>order.model.js"]
    T3 --> T4{"canTransitionTo('cancelled')?"}
    T4 -->|"No, raced"| E12["ApiError 400<br/>Cannot change status from X to cancelled"]
    T4 -->|Yes| T5{"paymentStatus === paid?"}
    T5 -->|Yes| T6["paymentStatus = refunded"]
    T5 -->|No| T7
    T6 --> T7[("for each item: Product.releaseStock(product, qty, session)<br/>$inc stock +qty, sold -qty")]
    T7 --> T8{"order.coupon.coupon?"}
    T8 -->|Yes| T9[("Coupon.release(id, session)<br/>$inc usedCount -1")]
    T8 -->|No| T10
    T9 --> T10[("order.save({ session })<br/>COMMIT, finally session.endSession()")]
    T10 --> CE1[("sendOrderEmail(order)<br/>User.findById name email")]
    CE1 --> CE2["sendEmail + orderStatusTemplate"]
    CE2 --> OK

    S2 -->|No| N1[("Order.findById(id)")]
    N1 --> N2{Order found?}
    N2 -->|No| E13["ApiError 404<br/>Order not found"]
    N2 -->|Yes| N3{"status === shipped<br/>and no trackingNumber?"}
    N3 -->|Yes| E14["ApiError 400<br/>Tracking number is required when shipping"]
    N3 -->|No| N4["order.changeStatus(status, by, note, trackingNumber)<br/>order.model.js"]
    N4 --> N5{"canTransitionTo(status)?<br/>ORDER_TRANSITIONS"}
    N5 -->|No| E15["ApiError 400<br/>Cannot change status from X to Y"]
    N5 -->|Yes| N6["set status, trackingNumber,<br/>delivered: deliveredAt + COD paymentStatus paid, paidAt<br/>statusHistory.push"]
    N6 --> N7[("order.save()")]
    N7 --> N8{"status === processing?"}
    N8 -->|Yes| OK
    N8 -->|No| NE1[("sendOrderEmail(order)<br/>User.findById name email")]
    NE1 --> NE2["sendEmail + orderStatusTemplate<br/>emails/templates.js"]
    NE2 --> OK["sendSuccess 200<br/>Order marked as STATUS + order"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin/orders`), `server/src/modules/orders/order.routes.js` (`adminOrderRoutes` + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/orders/order.validation.js` (`statusRules`), `server/src/modules/orders/order.controller.js` (`adminUpdateStatus`), `server/src/modules/orders/order.service.js` (`adminUpdateStatus`, `cancelWithRestore`, `sendOrderEmail`), `server/src/modules/orders/order.model.js` (`canTransitionTo`, `changeStatus`), `server/src/config/constants.js` (`ORDER_STATUS`, `ORDER_TRANSITIONS`), `server/src/modules/products/product.model.js` (`releaseStock`), `server/src/modules/coupons/coupon.model.js` (`release`), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (`orderStatusTemplate`), `server/src/middleware/error.middleware.js` (error response).
