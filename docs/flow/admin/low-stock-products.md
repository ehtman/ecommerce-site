# Low-stock products (admin) – `GET /api/admin/products/low-stock`

An admin lists the active products whose stock is at or below a threshold (`?threshold`, default 5), emptiest first and capped at 100 rows: what to re-order today. This is the only low-stock route (the products module's own `lowStock` handler is not mounted). Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/products/low-stock?threshold="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| RT["route declared BEFORE /products/:id<br/>so low-stock is never read as an id"]
    RT --> V1["validate(lowStockRules)<br/>admin.validation.js"]
    V1 --> V2{"threshold optional,<br/>whole number 0 to 1000?<br/>then toInt"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>threshold must be a whole number from 0 to 1000"]
    V2 -->|Yes| CT["lowStock<br/>admin.controller.js"]
    CT --> S1["adminService.getLowStock(req.query)<br/>threshold defaults to LIMITS.LOW_STOCK_THRESHOLD 5"]
    S1 --> S2[("Product.find isActive true, stock lte threshold<br/>.select name slug sku price stock images category<br/>.populate category name<br/>.sort stock 1, name 1<br/>.limit LOW_STOCK_LIST_MAX 100 .lean()")]
    S2 --> OK["sendSuccess 200 Low-stock products fetched<br/>array, emptiest first"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EV --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/admin/admin.validation.js` (`lowStockRules`), `server/src/modules/admin/admin.controller.js` (`lowStock`), `server/src/modules/admin/admin.service.js` (`getLowStock`), `server/src/config/constants.js` (`LIMITS.LOW_STOCK_THRESHOLD`, `ADMIN_REPORTS.LOW_STOCK_LIST_MAX`), `server/src/modules/products/product.model.js` (queried), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
