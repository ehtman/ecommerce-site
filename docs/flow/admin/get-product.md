# Get one product for editing (admin) – `GET /api/admin/products/:id`

An admin loads one product by id (active or not) for the edit page, including its stock history and who changed it. `/products/low-stock` is declared before this route, so that word is never read as an id. The handler belongs to the products module and is mounted under `/api/admin`. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/products/:id"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin', adminRoutes)"]
    D --> G0["router.use(protect, authorize(ROLES.ADMIN))<br/>admin.routes.js, guards every admin route"]
    G0 --> P1["protect<br/>auth.middleware.js"]
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
    Z2 -->|Yes| RT{"path is /products/low-stock?"}
    RT -->|Yes| LS["handled by the low-stock route<br/>declared first, see low-stock-products"]
    RT -->|No| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| CT["products.adminGet<br/>product.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["productService.adminGetProduct(req.params.id)<br/>product.service.js"]
    S1 --> S2[("Product.findById(id)<br/>.select +stockHistory, hidden by default<br/>.populate category name slug<br/>.populate stockHistory.by name<br/>.lean()")]
    S2 --> S3{"Product found?<br/>active or not"}
    S3 -->|No| E8["ApiError 404<br/>Product not found"]
    S3 -->|Yes| OK["sendSuccess 200 Product fetched<br/>product with stock history"]
    OK --> R[Client]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/products/product.controller.js` (`adminGet`), `server/src/modules/products/product.service.js` (`adminGetProduct`), `server/src/modules/products/product.model.js` (`stockHistory` select false), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
