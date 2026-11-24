# Check review eligibility – `GET /api/products/:id/reviews/eligibility`

Any logged-in user asks "may I review this product?". It never throws for "not allowed": it answers `{ canReview, reason?, review? }` so the product page can show the form, an explanation, or "Edit your review".

```mermaid
flowchart TD
    A[Client] -->|"GET /api/products/:id/reviews/eligibility"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["product.routes.js<br/>GET /:id/reviews/eligibility"]
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
    P6 -->|No| VO{"validateObjectId 'id'<br/>mongoose.isObjectIdOrHexString?"}
    VO -->|No| EVO["ApiError 400<br/>Invalid id"]
    VO -->|Yes| CT["review.controller.js eligibility<br/>req.user, req.params.id = PRODUCT id"]
    CT --> S1["reviewService.eligibility<br/>assertProductExists: Product.exists _id"]
    S1 --> D1{"Product exists?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| D2{"user.role is customer?"}
    D2 -->|No| N1["canReview false<br/>reason: Only customers can review"]
    D2 -->|Yes| S2["Promise.all<br/>findDeliveredOrder: Order.findOne user, status delivered, items.product .select _id<br/>Review.findOne user, product .lean"]
    S2 --> D3{"Review already exists?"}
    D3 -->|Yes| N2["canReview false<br/>reason: You already reviewed this product<br/>+ review for Edit your review"]
    D3 -->|No| D4{"Delivered order found?"}
    D4 -->|No| N3["canReview false<br/>reason: You can review this product after it is delivered to you"]
    D4 -->|Yes| N4["canReview true"]
    N1 --> S
    N2 --> S
    N3 --> S
    N4 --> S
    S["sendSuccess 200 Eligibility checked<br/>data = canReview, reason?, review?"] --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EVO --> EH
    E1 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/products, apiLimiter), `server/src/modules/products/product.routes.js` (nested GET /:id/reviews/eligibility), `server/src/middleware/auth.middleware.js` (protect), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/reviews/review.controller.js` (eligibility), `server/src/modules/reviews/review.service.js` (eligibility, assertProductExists, findDeliveredOrder), `server/src/modules/orders/order.model.js` (Order), `server/src/modules/reviews/review.model.js` (Review), `server/src/config/constants.js` (ROLES, ORDER_STATUS), `server/src/middleware/error.middleware.js` (errorHandler)
