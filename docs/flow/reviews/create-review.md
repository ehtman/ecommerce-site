# Create review – `POST /api/products/:id/reviews`

A customer writes ONE review (rating 1–5, optional title, comment 10–1000 chars) for a product from one of their DELIVERED orders. The author, product and proof order come from the token, URL and database, never the body. A post-save hook recalculates the product's rating.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/products/:id/reviews<br/>rating, title?, comment"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["product.routes.js<br/>POST /:id/reviews"]
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
    AZ -->|Yes| VO{"validateObjectId 'id'<br/>mongoose.isObjectIdOrHexString?"}
    VO -->|No| EVO["ApiError 400<br/>Invalid id"]
    VO -->|Yes| V{"validate reviewRules<br/>rating int 1-5, title optional max 80,<br/>comment trimmed 10-1000 chars"}
    V -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["review.controller.js create<br/>req.user._id, req.params.id = PRODUCT id, req.body"]
    CT --> S1["reviewService.createReview<br/>assertProductExists: Product.exists _id"]
    S1 --> D1{"Product exists?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| S2["findDeliveredOrder<br/>Order.findOne user, status delivered, items.product .select _id"]
    S2 --> D2{"Delivered order found?<br/>BR-07a"}
    D2 -->|No| E2["ApiError 403<br/>You can only review products from your delivered orders"]
    D2 -->|Yes| S3["Review.exists user, product"]
    S3 --> D3{"Already reviewed?<br/>BR-07b"}
    D3 -->|Yes| E3["ApiError 409<br/>You already reviewed this product"]
    D3 -->|No| S4["Review.create<br/>user, product, order = order._id, rating, title, comment"]
    S4 --> D4{"Insert OK?"}
    D4 -->|"No, err.code 11000<br/>unique index product + user, race"| E4["ApiError 409<br/>You already reviewed this product"]
    D4 -->|"No, other error"| E5["rethrow<br/>errorHandler maps ValidationError 400, else 500"]
    D4 -->|Yes| H1["post save hook<br/>Review.calcProductRating product"]
    H1 --> H2["Review.aggregate<br/>$match product + isVisible true<br/>$group avg rating, count"]
    H2 --> H3["Product.updateOne<br/>ratingAverage rounded to 1 decimal, ratingCount<br/>0 / 0 when no visible reviews"]
    H3 --> S["sendSuccess 201 Thank you for your review<br/>data = review"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EVO --> EH
    EV --> EH
    E1 --> EH
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/products, apiLimiter), `server/src/modules/products/product.routes.js` (nested POST /:id/reviews), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId, validate), `server/src/modules/reviews/review.validation.js` (reviewRules), `server/src/modules/reviews/review.controller.js` (create), `server/src/modules/reviews/review.service.js` (createReview, assertProductExists, findDeliveredOrder), `server/src/modules/orders/order.model.js` (Order), `server/src/modules/reviews/review.model.js` (Review, unique index one_review_per_product, post save hook, calcProductRating), `server/src/modules/products/product.model.js` (ratingAverage, ratingCount), `server/src/config/constants.js` (REVIEW, ROLES, ORDER_STATUS), `server/src/middleware/error.middleware.js` (errorHandler)
