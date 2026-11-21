# Remove product image – `DELETE /api/products/:id/images/:imageId`

Admin only: removes ONE image (by its sub-document `_id`) from a product and then deletes the file from Cloudinary. A product must keep at least one image.

```mermaid
flowchart TD
    A[Client] -->|DELETE /api/products/:id/images/:imageId| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[productRoutes<br/>product.routes.js]
    D --> P1{"protect<br/>auth.middleware.js<br/>Bearer token in Authorization header?"}
    P1 -->|No| X1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify(token, JWT_SECRET) ok?"}
    P2 -->|No| X2["ApiError 401<br/>Not authorised, token invalid or expired"]
    P2 -->|Yes| P3{"User.findById(payload.id) found?"}
    P3 -->|No| X3["ApiError 401<br/>Not authorised, user no longer exists"]
    P3 -->|Yes| P4{user.isActive?}
    P4 -->|No| X4["ApiError 403<br/>Account disabled"]
    P4 -->|Yes| P5{"user.isTokenOutdated(payload.v)?"}
    P5 -->|Yes| X5["ApiError 401<br/>Password was changed, please log in again"]
    P5 -->|No| P6{"authorize('admin')<br/>req.user.role is admin?"}
    P6 -->|No| X6["ApiError 403<br/>Access denied"]
    P6 -->|Yes| VO{"validateObjectId('id', 'imageId')<br/>validate.middleware.js<br/>both 24-hex ObjectIds?"}
    VO -->|No| X7["ApiError 400<br/>Invalid id (field: id or imageId)"]
    VO -->|Yes| F["removeImage<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.removeImage(id, imageId)<br/>product.service.js"]
    G --> H{"Product.findById(id) found?"}
    H -->|No| X8["ApiError 404<br/>Product not found"]
    H -->|Yes| I{"product.images.id(imageId) found?"}
    I -->|No| X9["ApiError 404<br/>Image not found"]
    I -->|Yes| J{"product.images.length is 1 or less?"}
    J -->|Yes| X10["ApiError 400<br/>A product needs at least one image"]
    J -->|No| K["remember publicId<br/>image.deleteOne() removes it from the array"]
    K --> L["product.save({ validateModifiedOnly: true })"]
    L --> L1{Validators on changed paths pass?}
    L1 -->|No| X11["Mongoose ValidationError<br/>errorHandler turns it into 400 Validation failed"]
    L1 -->|Yes| DI{"deleteImage(publicId)<br/>config/cloudinary.js<br/>Cloudinary configured and publicId starts with shopease/?"}
    DI -->|No| DI1["skip, returns false"]
    DI -->|Yes| DI2["cloudinaryClient.destroy(publicId)<br/>Cloudinary API<br/>on failure: console.error, returns false (never throws)"]
    DI1 --> S
    DI2 --> S
    S["sendSuccess 200<br/>Image removed + product"]
    S --> R[Client]
    X1 --> EH["errorHandler<br/>error.middleware.js"]
    X2 --> EH
    X3 --> EH
    X4 --> EH
    X5 --> EH
    X6 --> EH
    X7 --> EH
    X8 --> EH
    X9 --> EH
    X10 --> EH
    X11 --> EH
```

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (`DELETE /:id/images/:imageId` with `protect`, `authorize(ROLES.ADMIN)`, `validateObjectId('id', 'imageId')`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/products/product.controller.js` (`removeImage`), `server/src/modules/products/product.service.js` (`removeImage`), `server/src/modules/products/product.model.js` (`images` sub-documents with `_id`), `server/src/db/schemas/image.schema.js` (image `{ _id, url, publicId }`), `server/src/config/cloudinary.js` (`deleteImage`, `cloudinaryClient.destroy`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
