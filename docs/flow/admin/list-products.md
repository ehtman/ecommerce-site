# List all products (admin) – `GET /api/admin/products`

An admin lists ALL products (inactive ones too) for the admin table: search by name or SKU, filter by category id and status, sort by lowest stock or newest, paginated (default 20, max 100). Invalid filter values are ignored, not refused. The handler belongs to the products module and is mounted under `/api/admin`. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/products?search=&category=&status=&sort=&page=&limit="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| CT["products.adminList<br/>product.controller.js<br/>re-exported by admin.routes.js, no query rules"]
    CT --> S1["productService.adminListProducts(req.query)<br/>product.service.js"]
    S1 --> S2["getPagination(query, 20, 100)<br/>bad values fall back to defaults"]
    S2 --> S3{"search is non-empty text?"}
    S3 -->|Yes| S4["escapeRegex(search.trim()), flag i<br/>filter.$or = name or sku matches"]
    S3 -->|No| S5
    S4 --> S5{"category is a real ObjectId?"}
    S5 -->|Yes| S6["filter.category = id"]
    S5 -->|"No, ignored"| S7
    S6 --> S7["status active or inactive sets filter.isActive<br/>sort = stock ? stock 1, _id 1 : createdAt -1, _id -1"]
    S7 --> S8[("Promise.all<br/>Product.find(filter).select ADMIN_FIELDS<br/>.populate category name .sort.skip.limit.lean()<br/>Product.countDocuments(filter)")]
    S8 --> S9["buildMeta(page, limit, total)"]
    S9 --> OK["sendSuccess 200 Products fetched<br/>data + meta"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/modules/products/product.controller.js` (`adminList`), `server/src/modules/products/product.service.js` (`adminListProducts`, `ADMIN_FIELDS`, `ADMIN_PAGE`), `server/src/modules/products/product.query.js` (`escapeRegex`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/modules/products/product.model.js` (queried), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
