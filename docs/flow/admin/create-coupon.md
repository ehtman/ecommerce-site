# Create a coupon (admin) – `POST /api/admin/coupons`

An admin creates a discount code. Same handler and rules as `POST /api/coupons`, mounted here as an alias: the body is validated, the code upper-cased and unique, only whitelisted fields are copied and `createdBy` comes from the token. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/admin/coupons"| B[Express app<br/>app.js]
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
    Z2 -->|Yes| V1["validate(couponRules)<br/>coupon.validation.js"]
    V1 --> V2{"couponRules pass?<br/>code: string, trim, toUpperCase, 3–20 letters or digits<br/>description: optional text, max 150<br/>type: percentage or fixed<br/>value: int 1 or more, max 90 if percentage, max 100000 if fixed<br/>maxDiscount, minOrderAmount, usageLimit: optional ints<br/>startsAt: optional ISO 8601<br/>expiresAt: required ISO 8601, after startsAt<br/>isActive: optional boolean"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["coupons.create<br/>coupon.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["couponService.createCoupon(req.user._id, req.body)<br/>coupon.service.js"]
    S1 --> S2[("assertCodeFree(code)<br/>Coupon.exists({ code: normalizeCode(code) })")]
    S2 --> S3{Code already used?}
    S3 -->|Yes| E8["ApiError 409<br/>Coupon code already exists"]
    S3 -->|No| S4[("Coupon.create({ ...pick(body), createdBy: adminId })<br/>only whitelisted fields, schema validators run")]
    S4 --> S5{Saved?}
    S5 -->|"ValidationError"| E9["Mongoose ValidationError<br/>mapped to 400 Validation failed"]
    S5 -->|"Duplicate key 11000"| E10["Mongo error 11000<br/>mapped to 409 already exists"]
    S5 -->|Yes| OK["sendSuccess 201 Coupon created<br/>new coupon"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EV --> EH
    E8 --> EH
    E9 --> EH
    E10 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/coupons/coupon.validation.js` (`couponRules`), `server/src/modules/coupons/coupon.controller.js`, `server/src/modules/coupons/coupon.service.js`, `server/src/modules/coupons/coupon.model.js` (schema validators, unique index on `code`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response) (ValidationError to 400, 11000 to 409).
