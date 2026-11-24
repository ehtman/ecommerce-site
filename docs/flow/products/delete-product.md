# Delete product – `DELETE /api/products/:id`

Admin-only. A product used in any order is only deactivated (BR-10, soft delete). Otherwise it is really deleted, removed from every cart and wishlist, and since branch 09 its reviews are deleted too (`Review.deleteMany`, which skips the rating hooks); its images are then deleted from Cloudinary.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/products/:id"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["product.routes.js<br/>...admin = protect, authorize ADMIN"]
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
    VO -->|Yes| CT["product.controller.js remove<br/>req.params.id"]
    CT --> S1["productService.deleteProduct<br/>Product.findById id"]
    S1 --> D1{"Product found?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| S0["Order.exists items.product = id"]
    S0 --> D2{"Used in an order?<br/>BR-10"}
    D2 -->|Yes| SD["product.isActive = false<br/>product.save validateModifiedOnly"]
    SD --> SS["sendSuccess 200<br/>Product is used in orders, so it was deactivated instead of deleted<br/>softDeleted true"]
    SS --> R
    D2 -->|No| S2["product.deleteOne"]
    S2 --> S3["Promise.all<br/>Cart.updateMany items.product = id, $pull items product id<br/>Wishlist.updateMany products = id, $pull products id<br/>Review.deleteMany product = id, no rating hooks"]
    S3 --> S4["Promise.all product.images: deleteImage publicId<br/>config/cloudinary.js, Cloudinary destroy<br/>never throws"]
    S4 --> S["sendSuccess 200 Product deleted<br/>softDeleted false"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EVO --> EH
    E1 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/products, apiLimiter), `server/src/modules/products/product.routes.js` (admin guards, validateObjectId), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validateObjectId), `server/src/modules/products/product.controller.js` (remove), `server/src/modules/products/product.service.js` (deleteProduct), `server/src/modules/orders/order.model.js` (Order), `server/src/modules/cart/cart.model.js` (Cart), `server/src/modules/wishlist/wishlist.model.js` (Wishlist), `server/src/modules/reviews/review.model.js` (Review), `server/src/config/cloudinary.js` (deleteImage), `server/src/middleware/error.middleware.js` (errorHandler)
