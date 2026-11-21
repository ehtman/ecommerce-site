# List brands – `GET /api/products/brands`

Public endpoint (no token needed): every distinct brand used by an ACTIVE product, sorted A to Z, for the shop's brand filter. The `/brands` route is declared before `/:slug`, so "brands" is never treated as a product slug.

```mermaid
flowchart TD
    A[Client] -->|GET /api/products/brands| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[productRoutes<br/>product.routes.js]
    D --> E["router.get('/brands')<br/>public, matched BEFORE '/:slug'"]
    E --> F["brands<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.listBrands()<br/>product.service.js"]
    G --> H["Product.distinct('brand',<br/>{ isActive: true, brand: { $nin: [null, ''] } })"]
    H --> I{DB error?}
    I -->|Yes| EH["errorHandler<br/>error.middleware.js (500)"]
    I -->|No| J["brands.sort with localeCompare<br/>A to Z"]
    J --> K["sendSuccess 200<br/>Brands fetched + array of brand names"]
    K --> R[Client]
```

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (public `GET /brands`, ordered before `/:slug`), `server/src/modules/products/product.controller.js` (`brands`), `server/src/modules/products/product.service.js` (`listBrands`), `server/src/modules/products/product.model.js` (Product schema), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
