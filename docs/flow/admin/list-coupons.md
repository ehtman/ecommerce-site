# List all coupons (admin) – `GET /api/admin/coupons`

An admin gets every coupon, newest first, each with its computed `state`. Same handler as `GET /api/coupons`, mounted here as an alias. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/coupons"| B[Express app<br/>app.js]
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
    Z2 -->|Yes| CT["coupons.list<br/>coupon.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["couponService.listCoupons()<br/>coupon.service.js"]
    S1 --> S2[("Coupon.find().sort createdAt -1, _id -1<br/>not lean, so virtuals are kept")]
    S2 --> S3["toJSON plugin<br/>adds state virtual, removes __v"]
    S3 --> OK["sendSuccess 200 Coupons fetched<br/>array of coupons"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/modules/coupons/coupon.controller.js`, `server/src/modules/coupons/coupon.service.js`, `server/src/modules/coupons/coupon.model.js` (schema validators, unique index on `code`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/db/plugins/toJSON.js` (virtuals), `server/src/middleware/error.middleware.js` (error response).
