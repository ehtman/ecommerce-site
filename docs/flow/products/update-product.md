# Update product – `PUT /api/products/:id`

Admin only: replaces a product's editable fields (the admin form sends the whole product). `stock` is ignored here (use `PATCH /api/products/:id/stock`). Renaming builds a new slug. Images that were removed from the product are deleted from Cloudinary, but only after the save worked.

```mermaid
flowchart TD
    A[Client] -->|PUT /api/products/:id| B[Express app<br/>app.js]
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
    P6 -->|Yes| VO{"validateObjectId('id')<br/>validate.middleware.js<br/>24-hex ObjectId?"}
    VO -->|No| X7["ApiError 400<br/>Invalid id (field: id)"]
    VO -->|Yes| V{"validate(productRules)<br/>product.validation.js<br/>whole product valid?"}
    V -->|No| X8["ApiError 400<br/>Validation failed + errors: field, message"]
    V -->|Yes| F["update<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.updateProduct(req.params.id, req.body)<br/>product.service.js"]
    G --> H{"Product.findById(id) found?"}
    H -->|No| X9["ApiError 404<br/>Product not found"]
    H -->|Yes| I{"body.category sent?"}
    I -->|Yes| I2{"assertCategory<br/>Category.exists({ _id: body.category })?"}
    I2 -->|No| X10["ApiError 400<br/>Category not found (field: category)"]
    I2 -->|Yes| J
    I -->|No| J{"body.sku sent?"}
    J -->|Yes| J2{"assertSkuFree(sku, id)<br/>Product.exists({ sku, _id: { $ne: id } })?"}
    J2 -->|Yes| X11["ApiError 409<br/>A product with this SKU already exists (field: sku)"]
    J2 -->|No| K
    J -->|No| K["oldImageIds = product.images publicIds"]
    K --> L["pickProductFields(body) then Object.assign(product, data)<br/>FIELDS whitelist only, stock is not copied<br/>product.compareAtPrice = compareAtPrice (not sent, '' or null removes it)"]
    L --> M["product.save()<br/>pre('validate') setSlug hook: new uniqueSlug only if name changed<br/>runs every schema validator"]
    M --> M1{Schema validators pass?}
    M1 -->|No| X12["Mongoose ValidationError<br/>errorHandler turns it into 400 Validation failed"]
    M1 -->|Yes| M2{"Unique index conflict?<br/>(sku or slug, error 11000)"}
    M2 -->|Yes| X13["E11000 duplicate key<br/>errorHandler turns it into 409 field already exists"]
    M2 -->|No| N["removed = oldImageIds not in the new images<br/>Promise.all(removed.map(deleteImage))"]
    N --> DI{"deleteImage(publicId)<br/>config/cloudinary.js<br/>Cloudinary configured and publicId starts with shopease/?"}
    DI -->|No| DI1["skip, returns false"]
    DI -->|Yes| DI2["cloudinaryClient.destroy(publicId)<br/>Cloudinary API<br/>on failure: console.error, returns false (never throws)"]
    DI1 --> S
    DI2 --> S
    S["sendSuccess 200<br/>Product updated + product"]
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
    X12 --> EH
    X13 --> EH
```

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (`PUT /:id` with `protect`, `authorize(ROLES.ADMIN)`, `validateObjectId('id')`, `validate(productRules)`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/products/product.validation.js` (`productRules`), `server/src/modules/products/product.controller.js` (`update`), `server/src/modules/products/product.service.js` (`updateProduct`, `assertCategory`, `assertSkuFree`, `pickProductFields`), `server/src/modules/products/product.model.js` (validators, `setSlug` hook), `server/src/db/utils/slugify.js` (`uniqueSlug`), `server/src/config/cloudinary.js` (`deleteImage`, `cloudinaryClient.destroy`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
