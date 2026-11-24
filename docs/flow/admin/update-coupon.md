# Update a coupon (admin) – `PUT /api/admin/coupons/:id`

An admin replaces a coupon's settings. Same handler and rules as `PUT /api/coupons/:id`, mounted here as an alias: the code must stay unique among other coupons, only whitelisted fields are copied, and `usedCount` and `createdBy` can never change. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PUT /api/admin/coupons/:id"| B[Express app<br/>app.js]
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
    O2 -->|Yes| V1["validate(couponRules)<br/>coupon.validation.js"]
    V1 --> V2{"couponRules pass?<br/>code: string, trim, toUpperCase, 3–20 letters or digits<br/>description: optional text, max 150<br/>type: percentage or fixed<br/>value: int 1 or more, max 90 if percentage, max 100000 if fixed<br/>maxDiscount, minOrderAmount, usageLimit: optional ints<br/>startsAt: optional ISO 8601<br/>expiresAt: required ISO 8601, after startsAt<br/>isActive: optional boolean"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["coupons.update<br/>coupon.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["couponService.updateCoupon(req.params.id, req.body)<br/>coupon.service.js"]
    S1 --> S2[("Coupon.findById(id)")]
    S2 --> S3{Coupon found?}
    S3 -->|No| E8["ApiError 404<br/>Coupon not found"]
    S3 -->|Yes| S4[("assertCodeFree(code, id)<br/>Coupon.exists code, _id $ne id")]
    S4 --> S5{Another coupon has this code?}
    S5 -->|Yes| E9["ApiError 409<br/>Coupon code already exists"]
    S5 -->|No| S6["Object.assign(coupon, pick(body))<br/>empty maxDiscount = no cap<br/>empty usageLimit = null, unlimited"]
    S6 --> S7[("coupon.save()<br/>every schema validator runs again")]
    S7 --> S8{Saved?}
    S8 -->|"ValidationError"| E10["Mongoose ValidationError<br/>mapped to 400 Validation failed"]
    S8 -->|"Duplicate key 11000"| E11["Mongo error 11000<br/>mapped to 409 already exists"]
    S8 -->|Yes| OK["sendSuccess 200 Coupon updated<br/>updated coupon"]
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
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/coupons/coupon.validation.js` (`couponRules`), `server/src/modules/coupons/coupon.controller.js`, `server/src/modules/coupons/coupon.service.js`, `server/src/modules/coupons/coupon.model.js` (schema validators, unique index on `code`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response) (ValidationError to 400, 11000 to 409).
