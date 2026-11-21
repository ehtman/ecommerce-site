# Update a coupon (admin) – `PUT /api/coupons/:id`

An admin replaces a coupon's settings (the form always sends every field). The code must stay unique among OTHER coupons, only whitelisted fields are copied, an empty `maxDiscount` removes the cap and an empty `usageLimit` makes it unlimited; `usedCount` and `createdBy` can never be changed here. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PUT /api/coupons/:id"| B[Express app<br/>app.js]
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
    O2 -->|Yes| V1["validate(couponRules)<br/>coupon.validation.js"]
    V1 --> V2{"couponRules pass?<br/>code: string, trim, toUpperCase, 3–20 letters or digits<br/>description: optional text, max 150<br/>type: percentage or fixed<br/>value: int ≥ 1, max 90 if percentage, max 100000 if fixed<br/>maxDiscount ≥ 1, minOrderAmount ≥ 0, usageLimit ≥ 1: optional ints<br/>startsAt: optional ISO 8601<br/>expiresAt: required ISO 8601, after startsAt<br/>isActive: optional boolean"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["update<br/>coupon.controller.js"]
    CT --> S1["couponService.updateCoupon(req.params.id, req.body)<br/>coupon.service.js"]
    S1 --> S2[("Coupon.findById(id)")]
    S2 --> S3{Coupon found?}
    S3 -->|No| E8["ApiError 404<br/>Coupon not found"]
    S3 -->|Yes| S4["assertCodeFree(body.code, id)"]
    S4 --> S5[("Coupon.exists({ code, _id: { $ne: id } })")]
    S5 --> S6{Another coupon has this code?}
    S6 -->|Yes| E9["ApiError 409<br/>Coupon code already exists"]
    S6 -->|No| S7["Object.assign(coupon, pick(body))<br/>only the allowed fields"]
    S7 --> S8{"body.maxDiscount empty?"}
    S8 -->|Yes| S9["coupon.maxDiscount = undefined<br/>no cap"]
    S8 -->|No| S10{"body.usageLimit empty?"}
    S9 --> S10
    S10 -->|Yes| S11["coupon.usageLimit = null<br/>unlimited"]
    S10 -->|No| S12[("coupon.save()<br/>runs every schema validator again")]
    S11 --> S12
    S12 --> S13{Saved?}
    S13 -->|"ValidationError, e.g. value out of range for type"| E10["Mongoose ValidationError<br/>mapped to 400 Validation failed"]
    S13 -->|"Duplicate key 11000, race with another admin"| E11["Mongo error 11000<br/>mapped to 409 code already exists"]
    S13 -->|Yes| OK["sendSuccess 200 Coupon updated<br/>updated coupon"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/coupons`), `server/src/modules/coupons/coupon.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/coupons/coupon.validation.js` (`couponRules`), `server/src/config/constants.js` (`REGEX.COUPON_CODE`, `COUPON_TYPES`, `LIMITS.COUPON_MAX_PERCENT`, `LIMITS.COUPON_MAX_FIXED`), `server/src/modules/coupons/coupon.controller.js` (`update`), `server/src/modules/coupons/coupon.service.js` (`updateCoupon`, `assertCodeFree`, `pick`), `server/src/modules/coupons/coupon.model.js` (schema validators, unique index on `code`), `server/src/middleware/error.middleware.js` (ValidationError to 400, 11000 to 409, error response).
