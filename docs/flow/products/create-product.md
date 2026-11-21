# Create product – `POST /api/products`

Admin only: creates a product from a JSON body (images are `{ url, publicId }` pairs returned earlier by `POST /api/uploads/image`). The slug is generated from the name, `createdBy` comes from the token, and `stock` is accepted here only as the starting stock (default 0).

```mermaid
flowchart TD
    A[Client] -->|POST /api/products| B[Express app<br/>app.js]
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
    P6 -->|Yes| V{"validate(productRules)<br/>product.validation.js<br/>name, description, brand, sku (upper-cased),<br/>price, compareAtPrice, category, stock,<br/>images 1-5 Cloudinary URLs, specifications, flags OK?"}
    V -->|No| X7["ApiError 400<br/>Validation failed + errors: field, message"]
    V -->|Yes| F["create<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.createProduct(req.user._id, req.body)<br/>product.service.js"]
    G --> H{"assertCategory<br/>Category.exists({ _id: body.category })?"}
    H -->|No| X8["ApiError 400<br/>Category not found (field: category)"]
    H -->|Yes| I{"assertSkuFree<br/>Product.exists({ sku: SKU upper-cased })?"}
    I -->|Yes| X9["ApiError 409<br/>A product with this SKU already exists (field: sku)"]
    I -->|No| J["pickProductFields(body)<br/>only FIELDS whitelist (no slug, sold, ratings, stockHistory, createdBy)<br/>compareAtPrice '' or null = undefined<br/>images mapped to url + publicId"]
    J --> K["Product.create({ ...data, stock: body.stock ?? 0, createdBy: adminId })"]
    K --> L["pre('validate') setSlug hook<br/>product.model.js<br/>uniqueSlug(Product, name): Product.exists loop, adds -2, -3 if taken"]
    L --> M{Schema validators pass?}
    M -->|No| X10["Mongoose ValidationError<br/>errorHandler turns it into 400 Validation failed"]
    M -->|Yes| N{"Insert hits unique index?<br/>(sku or slug, error 11000)"}
    N -->|Yes| X11["E11000 duplicate key<br/>errorHandler turns it into 409 field already exists"]
    N -->|No| S["sendSuccess 201<br/>Product created + product"]
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

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (`POST /` with `protect`, `authorize(ROLES.ADMIN)`, `validate(productRules)`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/products/product.validation.js` (`productRules`), `server/src/modules/products/product.controller.js` (`create`), `server/src/modules/products/product.service.js` (`createProduct`, `assertCategory`, `assertSkuFree`, `pickProductFields`, `FIELDS`), `server/src/modules/products/product.model.js` (schema validators, `setSlug` hook, unique `sku`/`slug`), `server/src/db/utils/slugify.js` (`uniqueSlug`), `server/src/config/constants.js` (`REGEX.SKU`, `REGEX.CLOUDINARY_URL`, `LIMITS`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
