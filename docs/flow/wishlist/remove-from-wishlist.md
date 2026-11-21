# Remove product from wishlist – `DELETE /api/wishlist/:productId`

Removes a product from the logged-in customer's wishlist with an atomic `$pull`. Removing a product that is not saved is not an error (idempotent). Customers only.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/wishlist/:productId"| B[Express app<br/>app.js]
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
    VO -->|Yes| CT["wishlist.controller.js removeProduct<br/>req.params.productId"]
    CT --> S1["wishlistService.removeProduct<br/>Wishlist.removeProduct static<br/>updateOne user, $pull products productId<br/>missing = no-op, idempotent"]
    S1 --> W1["wishlistService.getWishlist userId<br/>Wishlist.forUser: findOneAndUpdate upsert, $setOnInsert<br/>.populate products CARD_FIELDS, match isActive true"]
    W1 --> W2["items = products.filter Boolean<br/>drops inactive and deleted products<br/>productIds = items ids"]
    W2 --> S["sendSuccess 200 'Removed from wishlist'<br/>productIds, items"]
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

**Files involved:** `server/src/app.js` (mounts /api/wishlist, apiLimiter), `server/src/modules/wishlist/wishlist.routes.js` (protect + authorize customer for every route), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/wishlist/wishlist.controller.js` (thin controller, sendSuccess), `server/src/modules/wishlist/wishlist.service.js` (business rules, getWishlist), `server/src/modules/wishlist/wishlist.model.js` (Wishlist schema, forUser upsert, addProduct, removeProduct statics), `server/src/middleware/error.middleware.js` (errorHandler)
