# Update review – `PUT /api/reviews/:id`

The author (customer only) replaces their own review's rating, title and comment. Someone else's review id answers the same 404 as a missing one. An empty title removes the headline. A post findOneAndUpdate hook recalculates the product's rating.

```mermaid
flowchart TD
    A[Client] -->|"PUT /api/reviews/:id<br/>rating, title?, comment"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["review.routes.js<br/>router.use protect, then PUT /:id"]
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
    V -->|Yes| CT["review.controller.js update<br/>req.user._id, req.params.id = REVIEW id, req.body"]
    CT --> S1{"reviewService.updateReview<br/>title given?"}
    S1 -->|Yes| U1["update = rating, title, comment"]
    S1 -->|No| U2["update = rating, comment,<br/>$unset title"]
    U1 --> S2
    U2 --> S2
    S2["Review.findOneAndUpdate<br/>filter _id + user = ownership check<br/>new true, runValidators true"]
    S2 --> D1{"Review returned?"}
    D1 -->|"No, missing or not yours"| E1["ApiError 404<br/>Review not found"]
    D1 -->|Yes| H1["post findOneAndUpdate hook<br/>Review.calcProductRating doc.product"]
    H1 --> H2["Review.aggregate<br/>$match product + isVisible true<br/>$group avg rating, count"]
    H2 --> H3["Product.updateOne<br/>ratingAverage rounded to 1 decimal, ratingCount"]
    H3 --> S["sendSuccess 200 Review updated<br/>data = updated review"]
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
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/reviews, apiLimiter), `server/src/modules/reviews/review.routes.js` (router.use protect, PUT /:id), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId, validate), `server/src/modules/reviews/review.validation.js` (reviewRules), `server/src/modules/reviews/review.controller.js` (update), `server/src/modules/reviews/review.service.js` (updateReview), `server/src/modules/reviews/review.model.js` (Review, post findOneAndUpdate hook, calcProductRating), `server/src/modules/products/product.model.js` (ratingAverage, ratingCount), `server/src/middleware/error.middleware.js` (errorHandler)
