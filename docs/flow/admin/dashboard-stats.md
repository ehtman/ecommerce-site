# Dashboard stats (admin) – `GET /api/admin/dashboard/stats`

An admin gets the key numbers for the admin home page over a rolling window (`?range=7d|30d|12m`, default `30d`): delivered revenue, orders per status, customers, active products, low stock, a revenue chart whose days (or months for `12m`) are named in the chosen time zone (`?tz`, default UTC), the 5 best sellers and the 5 newest orders. The ten independent queries run in parallel. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/dashboard/stats?range=&tz="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| V1["validate(statsRules)<br/>admin.validation.js"]
    V1 --> V2{"statsRules pass?<br/>range: optional, one of 7d, 30d, 12m<br/>tz: optional, isValidTimeZone via Intl"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["dashboardStats<br/>admin.controller.js"]
    CT --> S1["adminService.getDashboardStats(req.query)<br/>admin.service.js"]
    S1 --> S2["range = query.range or DEFAULT_RANGE 30d<br/>tz = query.tz or DEFAULT_TIMEZONE UTC<br/>days + format from ADMIN_REPORTS.DASHBOARD_RANGES<br/>from = now minus days x DAY_MS<br/>inRange = createdAt between from and now"]
    S2 --> PA["Promise.all<br/>10 queries at the same time"]
    PA --> Q1[("Order.aggregate revenue<br/>$match inRange + status delivered<br/>$group _id null, $sum totalPrice")]
    PA --> Q2[("Order.countDocuments(inRange)<br/>totalOrders")]
    PA --> Q3[("Order.aggregate byStatus<br/>$match inRange, $group by status, count<br/>$sort _id 1")]
    PA --> Q4[("User.countDocuments role customer<br/>totalCustomers")]
    PA --> Q5[("User.countDocuments role customer + inRange<br/>newCustomers")]
    PA --> Q6[("Product.countDocuments isActive true<br/>totalProducts")]
    PA --> Q7[("Product.countDocuments isActive true,<br/>stock lte LIMITS.LOW_STOCK_THRESHOLD 5<br/>lowStockCount")]
    PA --> Q8[("Order.aggregate revenueSeries<br/>$match inRange + delivered<br/>$group by $dateToString format, createdAt, timezone tz<br/>revenue + orders, $sort _id 1")]
    PA --> Q9[("Order.aggregate topProducts<br/>$match inRange, status not cancelled<br/>$unwind items, $group by items.product<br/>name, image, sold, revenue<br/>$sort sold -1, _id 1, $limit 5")]
    PA --> Q10[("Order.find().sort createdAt -1 .limit 5<br/>.select orderNumber user totalPrice status paymentStatus createdAt<br/>.populate user name .lean()<br/>recentOrders")]
    Q1 --> S3["Build the answer<br/>revenue = first row revenue or 0<br/>ordersByStatus = status + count<br/>revenueSeries = date, revenue, orders"]
    Q2 --> S3
    Q3 --> S3
    Q4 --> S3
    Q5 --> S3
    Q6 --> S3
    Q7 --> S3
    Q8 --> S3
    Q9 --> S3
    Q10 --> S3
    S3 --> OK["sendSuccess 200 Dashboard stats<br/>range, timezone, from, to, revenue, totalOrders,<br/>ordersByStatus, totalCustomers, newCustomers, totalProducts,<br/>lowStockCount, revenueSeries, topProducts, recentOrders"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/admin/admin.validation.js` (`statsRules`, `tzRule`), `server/src/utils/dates.js` (`isValidTimeZone`, `DAY_MS`), `server/src/config/constants.js` (`ADMIN_REPORTS`, `LIMITS.LOW_STOCK_THRESHOLD`, `ORDER_STATUS`, `ROLES`), `server/src/modules/admin/admin.controller.js` (`dashboardStats`), `server/src/modules/admin/admin.service.js` (`getDashboardStats`), `server/src/modules/models.js` (`Order`, `User`, `Product`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
