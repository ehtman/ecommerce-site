# Customer detail (admin) – `GET /api/admin/users/:id`

An admin opens one customer's page: the profile, their 50 newest orders and a summary (order count, money spent on delivered orders). An admin's id answers the same 404 as an unknown id. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/users/:id"| B[Express app<br/>app.js]
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
    Z2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| CT["getCustomer<br/>admin.controller.js"]
    CT --> S1["adminService.getCustomer(req.params.id)<br/>admin.service.js"]
    S1 --> S2[("User.findOne({ _id: id, role: customer })")]
    S2 --> S3{"Customer found?<br/>an admin id counts as not found"}
    S3 -->|No| E8["ApiError 404<br/>Customer not found"]
    S3 -->|Yes| S4[("Promise.all<br/>Order.find user id .select orderNumber totalPrice status<br/>paymentStatus paymentMethod createdAt<br/>.sort createdAt -1 .limit 50 .lean()<br/>Order.aggregate $match user, $group orderCount,<br/>totalSpent = delivered orders only")]
    S4 --> S5["return user, orders, summary<br/>orderCount and totalSpent default 0<br/>user toJSON plugin hides password hash and tokens"]
    S5 --> OK["sendSuccess 200 Customer fetched<br/>user + orders + summary"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/admin/admin.controller.js` (`getCustomer`), `server/src/modules/admin/admin.service.js` (`getCustomer`), `server/src/config/constants.js` (`ROLES`, `ADMIN_REPORTS.CUSTOMER_DETAIL_ORDERS`, `ORDER_STATUS`), `server/src/modules/users/user.model.js` (toJSON plugin), `server/src/modules/orders/order.model.js` (queried), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
