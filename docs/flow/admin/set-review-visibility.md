# Hide or show a review (admin) – `PATCH /api/admin/reviews/:id/visibility`

An admin hides or shows a review with `{ isVisible }`. The model's post hook recalculates the product's rating average and count from the visible reviews before the answer is sent. Same handler as `PATCH /api/reviews/:id/visibility`, mounted here as an alias. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/admin/reviews/:id/visibility"| B[Express app<br/>app.js]
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
    O2 -->|Yes| V1["validate(visibilityRules)<br/>review.validation.js"]
    V1 --> V2{"isVisible is a boolean?<br/>true, false or their text, then toBoolean"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>isVisible must be true or false"]
    V2 -->|Yes| CT["reviews.setVisibility<br/>review.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["reviewService.setVisibility(req.params.id, req.body.isVisible)<br/>review.service.js"]
    S1 --> S2[("Review.findOneAndUpdate({ _id: id }, { isVisible }, { new: true })")]
    S2 --> H1{"post findOneAndUpdate hook<br/>review.model.js: doc found?"}
    H1 -->|No| E8["ApiError 404<br/>Review not found"]
    H1 -->|Yes| H2[("Review.calcProductRating(doc.product)<br/>aggregate $match product + isVisible true<br/>$group avg rating, count")]
    H2 --> H3[("Product.updateOne<br/>ratingAverage rounded to 1 decimal or 0<br/>ratingCount or 0")]
    H3 --> S3{"review.isVisible?"}
    S3 -->|true| OK1["sendSuccess 200 Review is visible<br/>review"]
    S3 -->|false| OK2["sendSuccess 200 Review hidden<br/>review"]
    OK1 --> R[Client]
    OK2 --> R
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    EV --> EH
    E8 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/reviews/review.validation.js` (`visibilityRules`), `server/src/modules/reviews/review.controller.js` (`setVisibility`), `server/src/modules/reviews/review.service.js` (`setVisibility`), `server/src/modules/reviews/review.model.js` (post `findOneAndUpdate` hook, `calcProductRating`), `server/src/modules/products/product.model.js` (rating fields), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
