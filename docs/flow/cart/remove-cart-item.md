# Remove item from cart – `DELETE /api/cart/items/:productId`

Removes one product line from the logged-in customer's cart with an atomic `$pull`. Removing a product that is not in the cart is not an error (idempotent). Customers only.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/cart/items/:productId"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["cart.routes.js<br/>router.use protect, authorize"]
    RT --> P1{"protect: Bearer token in header?<br/>auth.middleware.js"}
    P1 -->|No| EP1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify token, JWT_SECRET OK?"}
    P2 -->|No| EP2["ApiError 401<br/>token invalid or expired"]
    P2 -->|Yes| P3["User.findById payload.id"]
    P3 --> P4{"User found?"}
    P4 -->|No| EP3["ApiError 401<br/>user no longer exists"]
    P4 -->|Yes| P5{"user.isActive?"}
    P5 -->|No| EP4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated payload.v?"}
    P6 -->|Yes| EP5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| AZ{"authorize ROLES.CUSTOMER<br/>req.user.role is customer?"}
    AZ -->|No| EP6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| VO{"validateObjectId 'productId'<br/>mongoose.isObjectIdOrHexString?"}
    VO -->|No| EVO["ApiError 400<br/>Invalid id"]
    VO -->|Yes| CT["cart.controller.js removeItem<br/>req.params.productId"]
    CT --> S1["cartService.removeItem<br/>Cart.updateOne user, $pull items product<br/>not in cart = no-op, idempotent"]
    S1 --> G1["cartService.getCartWithTotals userId<br/>Cart.forUser: findOneAndUpdate upsert, $setOnInsert<br/>.populate items.product PRODUCT_FIELDS"]
    G1 --> G2{"Any line whose product populated as null?<br/>product was deleted"}
    G2 -->|Yes| G3["Drop those lines<br/>cart.save"]
    G2 -->|No| G4
    G3 --> G4["Per line: lineIssue product, quantity<br/>not available / Out of stock / Only N left<br/>lineTotal = DB price x quantity"]
    G4 --> G5["subtotal and itemCount from lines WITHOUT issue<br/>shipping = calcShipping subtotal, utils/pricing.js<br/>0 if empty, free from Rs 5000, else Rs 250"]
    G5 --> S["sendSuccess 200 'Item removed'<br/>items, itemCount, subtotal, shipping, total,<br/>hasIssues, freeShippingMin"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EVO --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/cart, apiLimiter), `server/src/modules/cart/cart.routes.js` (protect + authorize customer for every route), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/cart/cart.controller.js` (thin controller, sendSuccess), `server/src/modules/cart/cart.service.js` (business rules, getCartWithTotals), `server/src/modules/cart/cart.model.js` (Cart schema, Cart.forUser upsert), `server/src/utils/pricing.js` (calcShipping), `server/src/config/constants.js` (LIMITS.MAX_CART_QTY, PRICING), `server/src/middleware/error.middleware.js` (errorHandler)
