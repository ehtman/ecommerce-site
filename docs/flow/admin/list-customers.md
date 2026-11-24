# List customers (admin) – `GET /api/admin/users`

An admin lists customer accounts (never admins), newest first, paginated (default 20, max 100), searchable by name or email and filterable by active or inactive. Each row carries the customer's order count and money spent on delivered orders, fetched with one extra aggregation for the whole page. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/users?search=&status=&page=&limit="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| V1["validate(listCustomersRules)<br/>admin.validation.js"]
    V1 --> V2{"listCustomersRules pass?<br/>search: optional text, trimmed, max 100<br/>status: optional, active or inactive<br/>page: optional int 1 or more<br/>limit: optional int 1 to 100"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["listCustomers<br/>admin.controller.js"]
    CT --> S1["adminService.listCustomers(req.query)<br/>admin.service.js"]
    S1 --> S2["getPagination(query, 20, 100)<br/>utils/pagination.js"]
    S2 --> S3["filter = role customer<br/>admins never listed"]
    S3 --> S4{search sent?}
    S4 -->|Yes| S5["escapeRegex(search), flag i<br/>filter.$or = name or email matches"]
    S4 -->|No| S6
    S5 --> S6{"status active or inactive?"}
    S6 -->|active| S7["filter.isActive = true"]
    S6 -->|inactive| S8["filter.isActive = false"]
    S6 -->|not sent| S9
    S7 --> S9[("Promise.all<br/>User.find(filter).sort createdAt -1, _id -1<br/>.skip.limit.lean()<br/>User.countDocuments(filter)")]
    S8 --> S9
    S9 --> S10[("Order.aggregate, ONE query for the page<br/>$match user $in page user ids<br/>$group by user: orders count,<br/>spent = sum totalPrice of delivered orders")]
    S10 --> S11["Map by user id<br/>each row built from an allow-list: _id, name, email, phone,<br/>isActive, isEmailVerified, authProvider, createdAt,<br/>orderCount, totalSpent default 0"]
    S11 --> S12["buildMeta(page, limit, total)"]
    S12 --> OK["sendSuccess 200 Customers fetched<br/>data + meta page, limit, total, pages"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/admin/admin.validation.js` (`listCustomersRules`), `server/src/modules/admin/admin.controller.js` (`listCustomers`), `server/src/modules/admin/admin.service.js` (`listCustomers`, `escapeRegex`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/config/constants.js` (`PAGINATION`, `ROLES`, `ORDER_STATUS`), `server/src/modules/users/user.model.js`, `server/src/modules/orders/order.model.js` (queried), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
