# Inventory overview (admin) – `GET /api/admin/inventory`

An admin gets a stock overview computed in one aggregation: product counts, units and stock value of active products, out-of-stock and low-stock counts, and a per-category table. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/inventory"| B[Express app<br/>app.js]
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
    Z2 -->|Yes| CT["inventory<br/>admin.controller.js<br/>no query rules"]
    CT --> S1["adminService.getInventoryOverview()<br/>admin.service.js"]
    S1 --> S2[("Product.aggregate, one query with $facet")]
    S2 --> F1[("facet totals<br/>$group _id null: totalProducts, activeProducts,<br/>totalUnits and stockValue of ACTIVE products via $cond,<br/>outOfStockCount stock 0, lowStockCount stock lte 5")]
    S2 --> F2[("facet byCategory<br/>$match isActive true, $group by category<br/>products, units, stockValue = price x stock<br/>$lookup categories name<br/>$project category name or Uncategorised<br/>$sort stockValue -1, category 1")]
    F1 --> S3{"totals row exists?<br/>no products = no row"}
    F2 --> S3
    S3 -->|No| S4["fall back to all zeros"]
    S3 -->|Yes| S5["inactiveProducts = totalProducts minus activeProducts<br/>lowStockThreshold = LIMITS.LOW_STOCK_THRESHOLD"]
    S4 --> S5
    S5 --> OK["sendSuccess 200 Inventory overview<br/>totals + inactiveProducts + lowStockThreshold + byCategory"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/modules/admin/admin.controller.js` (`inventory`), `server/src/modules/admin/admin.service.js` (`getInventoryOverview`), `server/src/config/constants.js` (`LIMITS.LOW_STOCK_THRESHOLD`), `server/src/modules/products/product.model.js` (aggregated), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
