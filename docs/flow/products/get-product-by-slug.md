# Get product by slug – `GET /api/products/:slug`

Public endpoint (no token needed): one ACTIVE product by its slug, with its category's name, slug and parent. An inactive product answers 404 exactly like a missing one.

```mermaid
flowchart TD
    A[Client] -->|GET /api/products/:slug| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[productRoutes<br/>product.routes.js]
    D --> E["router.get('/:slug')<br/>public, no guards<br/>('/brands' is matched earlier)"]
    E --> F["getBySlug<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.getProductBySlug(req.params.slug)<br/>product.service.js"]
    G --> H["Product.findOne({ slug, isActive: true })<br/>.populate('category', 'name slug parent')<br/>(not lean, so virtuals are kept)"]
    H --> I{Active product found?}
    I -->|No| E1["ApiError 404<br/>Product not found"]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    I -->|Yes| J["sendSuccess 200<br/>Product fetched + full product<br/>(toJSON plugin: virtuals inStock, discountPercent, no __v)"]
    J --> R[Client]
```

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (public `GET /:slug`), `server/src/modules/products/product.controller.js` (`getBySlug`), `server/src/modules/products/product.service.js` (`getProductBySlug`, `notFound`), `server/src/modules/products/product.model.js` (Product schema, `inStock` and `discountPercent` virtuals, `toJSON` plugin), `server/src/utils/ApiError.js` (404), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
