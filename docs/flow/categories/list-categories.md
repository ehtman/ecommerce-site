# List categories – `GET /api/categories`

Public endpoint (no token needed): returns every ACTIVE category as one flat list in menu order (`sortOrder`, then `name`). Sub-categories are in the same list and point to their top-level category through `parent`.

```mermaid
flowchart TD
    A[Client] -->|GET /api/categories| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[categoryRoutes<br/>category.routes.js]
    D --> E["router.get('/')<br/>public, no guards"]
    E --> F["list<br/>category.controller.js (asyncHandler)"]
    F --> G["categoryService.listActive<br/>category.service.js"]
    G --> H["Category.find({ isActive: true })<br/>.sort({ sortOrder: 1, name: 1 })"]
    H --> I{DB error?}
    I -->|Yes| EH["errorHandler<br/>error.middleware.js (500)"]
    I -->|No| J["sendSuccess 200<br/>Categories fetched + array of categories (toJSON plugin, no __v)"]
    J --> R[Client]
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`, global middleware), `server/src/modules/categories/category.routes.js` (public `GET /`), `server/src/modules/categories/category.controller.js` (`list`), `server/src/modules/categories/category.service.js` (`listActive`, `MENU_ORDER`), `server/src/modules/categories/category.model.js` (Category schema, `toJSON` plugin), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
