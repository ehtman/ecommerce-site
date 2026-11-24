# List all orders (admin) – `GET /api/admin/orders`

An admin lists every order, newest first, paginated (default 20, max 100), filtered by status, payment status, a date range and a search on order number or customer email. Since branch 10 the route lives in the admin router (`admin.routes.js`) and reuses the orders module's controller; the URL is unchanged. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/orders?page=&limit=&status=&paymentStatus=&from=&to=&search="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| VA["validate(listRules)<br/>order.validation.js"]
    VA --> VB{"listRules pass? empty values mean no filter<br/>status, paymentStatus: known values<br/>from, to: ISO 8601 dates<br/>search: text, max 50"}
    VB -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    VB -->|Yes| CT["orders.adminList<br/>order.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["orderService.adminListOrders(req.query)<br/>order.service.js"]
    S1 --> S2["getPagination(query, 20, 100)<br/>utils/pagination.js"]
    S2 --> S3["filter: status, paymentStatus when known<br/>createdAt $gte from, $lte to at 23:59:59.999Z"]
    S3 --> S4{search sent?}
    S4 -->|Yes| S5[("User.find email matches escaped regex<br/>.select _id .lean()")]
    S5 --> S6["filter.$or = orderNumber regex<br/>or user $in matching ids"]
    S6 --> S7
    S4 -->|No| S7[("Promise.all<br/>Order.find(filter).sort createdAt -1, _id -1<br/>.skip.limit.select.populate user name email .lean()<br/>Order.countDocuments(filter)")]
    S7 --> S8["buildMeta(page, limit, total)"]
    S8 --> OK["sendSuccess 200<br/>Orders fetched + data + meta"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/orders/order.validation.js` (`listRules`), `server/src/modules/orders/order.controller.js` (`adminList`), `server/src/modules/orders/order.service.js` (`adminListOrders`, `escapeRegex`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/modules/orders/order.model.js` (schema, indexes), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
