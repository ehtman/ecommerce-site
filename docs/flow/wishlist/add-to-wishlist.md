# Add product to wishlist – `POST /api/wishlist/:productId`

Saves an active product to the logged-in customer's wishlist. Adding a product that is already saved changes nothing (idempotent, still 200); a full list (100 products) is refused atomically. Customers only.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/wishlist/:productId"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["wishlist.routes.js<br/>router.use protect, authorize"]
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
    VO -->|Yes| CT["wishlist.controller.js addProduct<br/>req.params.productId, no body"]
    CT --> S1["wishlistService.addProduct<br/>Product.exists _id, isActive true"]
    S1 --> D1{"Active product exists?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| S2["Wishlist.forUser userId<br/>findOneAndUpdate upsert"]
    S2 --> D2{"Product id already in products?"}
    D2 -->|Yes, idempotent| W1
    D2 -->|No| S3["Wishlist.addProduct static<br/>updateOne user + products.99 $exists false<br/>$addToSet products productId"]
    S3 --> D3{"matchedCount is 1?"}
    D3 -->|No, list full| E2["ApiError 400<br/>wishlist can hold at most 100 products"]
    D3 -->|Yes| W1["wishlistService.getWishlist userId<br/>Wishlist.forUser: findOneAndUpdate upsert, $setOnInsert<br/>.populate products CARD_FIELDS, match isActive true"]
    W1 --> W2["items = products.filter Boolean<br/>drops inactive and deleted products<br/>productIds = items ids"]
    W2 --> S["sendSuccess 200 'Added to wishlist'<br/>productIds, items"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EVO --> EH
    E1 --> EH
    E2 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/wishlist, apiLimiter), `server/src/modules/wishlist/wishlist.routes.js` (protect + authorize customer for every route), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/wishlist/wishlist.controller.js` (thin controller, sendSuccess), `server/src/modules/wishlist/wishlist.service.js` (business rules, getWishlist), `server/src/modules/wishlist/wishlist.model.js` (Wishlist schema, forUser upsert, addProduct, removeProduct statics), `server/src/middleware/error.middleware.js` (errorHandler), `server/src/config/constants.js` (LIMITS.MAX_WISHLIST)
