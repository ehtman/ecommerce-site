# Set review visibility – `PATCH /api/reviews/:id/visibility`

Admin-only moderation: hide or show a review (`isVisible: true | false`). Hidden reviews keep their data but vanish from the public list and from the product's average; a post findOneAndUpdate hook recalculates the rating.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/reviews/:id/visibility<br/>isVisible"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["review.routes.js<br/>router.use protect, then PATCH /:id/visibility"]
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
    P6 -->|No| AZ{"authorize ROLES.ADMIN<br/>req.user.role is admin?"}
    AZ -->|No| EP6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| VO{"validateObjectId 'id'<br/>mongoose.isObjectIdOrHexString?"}
    VO -->|No| EVO["ApiError 400<br/>Invalid id"]
    VO -->|Yes| V{"validate visibilityRules<br/>isVisible isBoolean, toBoolean"}
    V -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["review.controller.js setVisibility<br/>req.params.id, req.body.isVisible"]
    CT --> S1["reviewService.setVisibility<br/>Review.findOneAndUpdate _id, isVisible, new true"]
    S1 --> D1{"Review found?"}
    D1 -->|No| E1["ApiError 404<br/>Review not found"]
    D1 -->|Yes| H1["post findOneAndUpdate hook<br/>Review.calcProductRating doc.product"]
    H1 --> H2["Review.aggregate<br/>$match product + isVisible true<br/>$group avg rating, count"]
    H2 --> H3["Product.updateOne<br/>ratingAverage, ratingCount"]
    H3 --> D2{"review.isVisible?"}
    D2 -->|Yes| S["sendSuccess 200 Review is visible<br/>data = review"]
    D2 -->|No| S2["sendSuccess 200 Review hidden<br/>data = review"]
    S --> R
    S2 --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EVO --> EH
    EV --> EH
    E1 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/reviews, apiLimiter), `server/src/modules/reviews/review.routes.js` (router.use protect, PATCH /:id/visibility), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId, validate), `server/src/modules/reviews/review.validation.js` (visibilityRules), `server/src/modules/reviews/review.controller.js` (setVisibility), `server/src/modules/reviews/review.service.js` (setVisibility), `server/src/modules/reviews/review.model.js` (Review, post findOneAndUpdate hook, calcProductRating), `server/src/modules/products/product.model.js` (ratingAverage, ratingCount), `server/src/middleware/error.middleware.js` (errorHandler)
