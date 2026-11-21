# Delete a product (admin) – `DELETE /api/products/:id`

An admin deletes a product. If any order contains it (BR-10), it is only hidden (`isActive = false`) so order history keeps its link. Otherwise it is really deleted, removed from every cart and wishlist, and its Cloudinary images are deleted. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|DELETE /api/products/:id| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/products', productRoutes)"]
    D --> P1["protect<br/>auth.middleware.js"]
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
    O2 -->|Yes| CT["remove<br/>product.controller.js"]
    CT --> S1["productService.deleteProduct(req.params.id)<br/>product.service.js"]
    S1 --> S2[("Product.findById(id)")]
    S2 --> S3{Product found?}
    S3 -->|No| E8["ApiError 404<br/>Product not found"]
    S3 -->|Yes| S4[("Order.exists({ 'items.product': id })")]
    S4 --> S5{"Used in an order?<br/>BR-10"}
    S5 -->|Yes| SD1[("product.isActive = false<br/>product.save({ validateModifiedOnly: true })")]
    SD1 --> OK1["sendSuccess 200<br/>Product is used in orders, so it was deactivated instead of deleted<br/>{ softDeleted: true }"]
    S5 -->|No| HD1[("product.deleteOne()")]
    HD1 --> HD2[("Promise.all<br/>Cart.updateMany $pull items with product id<br/>Wishlist.updateMany $pull products id")]
    HD2 --> HD3["Promise.all deleteImage(publicId) per image<br/>config/cloudinary.js, Cloudinary"]
    HD3 --> OK2["sendSuccess 200<br/>Product deleted<br/>{ softDeleted: false }"]
    OK1 --> R[Client]
    OK2 --> R
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/products`), `server/src/modules/products/product.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/products/product.controller.js` (`remove`), `server/src/modules/products/product.service.js` (`deleteProduct`), `server/src/modules/orders/order.model.js` (`Order.exists` on `items.product`), `server/src/modules/cart/cart.model.js` + `server/src/modules/wishlist/wishlist.model.js` (`$pull` cleanup), `server/src/config/cloudinary.js` (`deleteImage`), `server/src/middleware/error.middleware.js` (error response).
