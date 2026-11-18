# Get category by slug – `GET /api/categories/:slug`

Public endpoint (no token needed): returns one ACTIVE category found by its readable slug, e.g. `/api/categories/mens-shoes`. A missing category and an inactive one both answer 404.

```mermaid
flowchart TD
    A[Client] -->|GET /api/categories/:slug| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[categoryRoutes<br/>category.routes.js]
    D --> E["router.get('/:slug')<br/>public, no guards"]
    E --> F["getBySlug<br/>category.controller.js (asyncHandler)"]
    F --> G["categoryService.getBySlug(req.params.slug)<br/>category.service.js"]
    G --> H["Category.findOne({ slug, isActive: true })<br/>slug lowercased by the schema"]
    H --> I{Found?}
    I -->|"No (missing or inactive)"| E1[ApiError 404<br/>Category not found]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    EH --> R[Client]
    I -->|Yes| J["sendSuccess 200<br/>Category fetched + category"]
    J --> R
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`), `server/src/modules/categories/category.routes.js` (public `GET /:slug`), `server/src/modules/categories/category.controller.js` (`getBySlug`), `server/src/modules/categories/category.service.js` (`getBySlug`, `notFound`), `server/src/modules/categories/category.model.js` (`slug` field with `lowercase: true`), `server/src/utils/ApiError.js` (404), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
