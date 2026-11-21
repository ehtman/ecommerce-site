# Delete a coupon (admin) – `DELETE /api/coupons/:id`

An admin deletes a coupon. If it was ever used (`usedCount > 0`) or any order references it (even a cancelled one whose use was released), it is only deactivated so order history never points at a missing coupon. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|DELETE /api/coupons/:id| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/coupons', couponRoutes)"]
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
    P7 -->|No| Z1["authorize(ROLES.ADMIN)<br/>auth.middleware.js"]
    Z1 --> Z2{role is admin?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| CT["remove<br/>coupon.controller.js"]
    CT --> S1["couponService.deleteCoupon(req.params.id)<br/>coupon.service.js"]
    S1 --> S2[("Coupon.findById(id)")]
    S2 --> S3{Coupon found?}
    S3 -->|No| E8["ApiError 404<br/>Coupon not found"]
    S3 -->|Yes| S4{"usedCount > 0?"}
    S4 -->|Yes| SD1
    S4 -->|No| S5[("Order.exists({ 'coupon.coupon': id })")]
    S5 --> S6{Referenced by an order?}
    S6 -->|Yes| SD1[("coupon.isActive = false<br/>coupon.save()")]
    SD1 --> OK1["sendSuccess 200<br/>Coupon was already used, so it was deactivated<br/>{ deactivated: true }"]
    S6 -->|No| HD1[("coupon.deleteOne()")]
    HD1 --> OK2["sendSuccess 200<br/>Coupon deleted<br/>{ deactivated: false }"]
    OK1 --> R[Client]
    OK2 --> R
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/coupons`), `server/src/modules/coupons/coupon.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/coupons/coupon.controller.js` (`remove`), `server/src/modules/coupons/coupon.service.js` (`deleteCoupon`), `server/src/modules/coupons/coupon.model.js` (schema), `server/src/modules/orders/order.model.js` (`Order.exists` on `coupon.coupon`), `server/src/middleware/error.middleware.js` (error response).
