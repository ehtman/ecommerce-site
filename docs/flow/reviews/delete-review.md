# Delete review – `DELETE /api/reviews/:id`

Any logged-in user may call it: a customer deletes only their own review (someone else's answers 404), an admin may delete any review. A post findOneAndDelete hook recalculates the product's rating.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/reviews/:id"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["review.routes.js<br/>router.use protect, then DELETE /:id, no authorize"]
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
    VO -->|Yes| CT["review.controller.js remove<br/>req.user, req.params.id = REVIEW id"]
    CT --> S1{"reviewService.deleteReview<br/>user.role is admin?"}
    S1 -->|Yes| F1["filter = _id"]
    S1 -->|No| F2["filter = _id + user = user._id"]
    F1 --> S2
    F2 --> S2
    S2["Review.findOneAndDelete filter"]
    S2 --> D1{"Review deleted?"}
    D1 -->|"No, missing or not yours"| E1["ApiError 404<br/>Review not found"]
    D1 -->|Yes| H1["post findOneAndDelete hook<br/>Review.calcProductRating doc.product"]
    H1 --> H2["Review.aggregate<br/>$match product + isVisible true<br/>$group avg rating, count"]
    H2 --> H3["Product.updateOne<br/>ratingAverage, ratingCount<br/>0 / 0 when no visible reviews left"]
    H3 --> S["sendSuccess 200 Review deleted"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EVO --> EH
    E1 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/reviews, apiLimiter), `server/src/modules/reviews/review.routes.js` (router.use protect, DELETE /:id), `server/src/middleware/auth.middleware.js` (protect), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/reviews/review.controller.js` (remove), `server/src/modules/reviews/review.service.js` (deleteReview), `server/src/modules/reviews/review.model.js` (Review, post findOneAndDelete hook, calcProductRating), `server/src/modules/products/product.model.js` (ratingAverage, ratingCount), `server/src/config/constants.js` (ROLES), `server/src/middleware/error.middleware.js` (errorHandler)
