# List product reviews – `GET /api/products/:id/reviews`

Public (no login) list of the VISIBLE reviews of one product, newest first and paginated (default 5 per page, max 20). Reviewer names are shown, emails never are.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/products/:id/reviews?page=&limit="| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["product.routes.js<br/>GET /:id/reviews, nested review route, public"]
    RT --> VO{"validateObjectId 'id'<br/>mongoose.isObjectIdOrHexString?"}
    VO -->|No| EVO["ApiError 400<br/>Invalid id"]
    VO -->|Yes| CT["review.controller.js listForProduct<br/>req.params.id = PRODUCT id, req.query"]
    CT --> S1["reviewService.listForProduct<br/>assertProductExists: Product.exists _id"]
    S1 --> D1{"Product exists?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| S2["getPagination query<br/>REVIEW.PAGE_SIZE 5, MAX_PAGE_SIZE 20<br/>utils/pagination.js"]
    S2 --> S3["filter = product id, isVisible true<br/>BR-07d hidden reviews stay hidden"]
    S3 --> S4["Promise.all<br/>Review.find filter .sort createdAt -1, _id -1<br/>.skip .limit .populate user name .lean<br/>Review.countDocuments filter"]
    S4 --> S5["buildMeta page, limit, total"]
    S5 --> S["sendSuccess 200 Reviews fetched<br/>data = reviews, meta = pagination"]
    S --> R
    EVO --> EH
    E1 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/products, apiLimiter), `server/src/modules/products/product.routes.js` (nested GET /:id/reviews), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/reviews/review.controller.js` (listForProduct), `server/src/modules/reviews/review.service.js` (listForProduct, assertProductExists), `server/src/modules/reviews/review.model.js` (Review, index product + isVisible + createdAt), `server/src/utils/pagination.js` (getPagination, buildMeta), `server/src/config/constants.js` (REVIEW), `server/src/middleware/error.middleware.js` (errorHandler)
