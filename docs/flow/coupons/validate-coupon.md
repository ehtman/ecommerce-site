# Validate (preview) a coupon on my cart – `POST /api/coupons/validate`

A logged-in customer sends a coupon code and gets back the discount and the new totals for their CURRENT cart, calculated on the server from today's product prices. It is only a preview: the coupon is not used up (`usedCount` is not changed). Admins get 403 because they have no cart.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/coupons/validate"| B[Express app<br/>app.js]
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
    P7 -->|No| Z1["authorize(ROLES.CUSTOMER)<br/>auth.middleware.js"]
    Z1 --> Z2{role is customer?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| V1["validate(validateCouponRules)<br/>coupon.validation.js"]
    V1 --> V2{"code is a string,<br/>not empty after trim,<br/>at most 20 chars?"}
    V2 -->|No| E7["ApiError 400<br/>Validation failed<br/>Enter a coupon code / Coupon code is too long"]
    V2 -->|Yes| CT["validateCoupon<br/>coupon.controller.js"]
    CT --> S1["couponService.previewCoupon(req.user._id, req.body.code)<br/>coupon.service.js"]
    S1 --> S2["normalizeCode<br/>trim + toUpperCase"]
    S2 --> S3[("Coupon.findOne({ code })")]
    S3 --> S4{Coupon found?}
    S4 -->|No| E8["ApiError 404<br/>Coupon not found"]
    S4 -->|Yes| S5["getCartWithTotals(userId)<br/>cart.service.js"]
    S5 --> S6[("Cart.forUser(userId) upsert<br/>.populate('items.product')")]
    S6 --> S7{Line with deleted product?}
    S7 -->|Yes| S8[("cart.save() without those lines")]
    S7 -->|No| S9["Sum price × quantity of lines<br/>without an issue = subtotal"]
    S8 --> S9
    S9 --> S10{cart.items empty?}
    S10 -->|Yes| E9["ApiError 400<br/>Your cart is empty"]
    S10 -->|No| S11{"subtotal at most 0?"}
    S11 -->|Yes| E10["ApiError 400<br/>Your cart has no items that can be bought"]
    S11 -->|No| M1["coupon.checkUsable(subtotal)<br/>coupon.model.js"]
    M1 --> M2{isActive?}
    M2 -->|No| R1["reason: Coupon is not active"]
    M2 -->|Yes| M3{now before startsAt?}
    M3 -->|Yes| R2["reason: Coupon is not active yet"]
    M3 -->|No| M4{now after expiresAt?}
    M4 -->|Yes| R3["reason: Coupon expired"]
    M4 -->|No| M5{"usageLimit set and<br/>usedCount reached it?"}
    M5 -->|Yes| R4["reason: Coupon usage limit reached"]
    M5 -->|No| M6{"subtotal below<br/>minOrderAmount?"}
    M6 -->|Yes| R5["reason: Minimum order is Rs X"]
    R1 --> E11["ApiError 400<br/>check.reason"]
    R2 --> E11
    R3 --> E11
    R4 --> E11
    R5 --> E11
    M6 -->|No| M7["coupon.calculateDiscount(subtotal)<br/>percentage: floor(subtotal × value / 100), capped by maxDiscount<br/>fixed: value<br/>never more than subtotal"]
    M7 --> M8["calcTotals(subtotal, discount)<br/>utils/pricing.js<br/>itemsPrice, discountPrice, shippingPrice, taxPrice, totalPrice"]
    M8 --> OK["sendSuccess 200 Coupon applied<br/>code, type, value, description + totals"]
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
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/coupons`), `server/src/modules/coupons/coupon.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/coupons/coupon.validation.js` (`validateCouponRules`), `server/src/modules/coupons/coupon.controller.js` (`validateCoupon`), `server/src/modules/coupons/coupon.service.js` (`previewCoupon`, `normalizeCode`), `server/src/modules/coupons/coupon.model.js` (`checkUsable`, `calculateDiscount`), `server/src/modules/cart/cart.service.js` (`getCartWithTotals`), `server/src/modules/cart/cart.model.js` (`Cart.forUser`), `server/src/utils/pricing.js` (`calcTotals`), `server/src/middleware/error.middleware.js` (error response).
