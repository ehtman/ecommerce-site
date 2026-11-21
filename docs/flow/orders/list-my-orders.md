# List my orders – `GET /api/orders/my`

A logged-in customer reads their own orders, newest first, paginated (default 10, max 50) with an optional `?status=` filter. Only customers may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/orders/my?page=&limit=&status="| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/orders', orderRoutes)"]
    D --> P1["router.use(protect)<br/>auth.middleware.js"]
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
    P7 -->|No| Z1["authorize(ROLES.CUSTOMER)<br/>auth.middleware.js"]
    Z1 --> Z2{role is customer?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| VA["validate(listRules)<br/>order.validation.js"]
    VA --> VB{"status, paymentStatus, from, to, search<br/>valid when present?"}
    VB -->|No| E7["ApiError 400<br/>Validation failed + field errors"]
    VB -->|Yes| CT["getMyOrders<br/>order.controller.js"]
    CT --> S1["orderService.getMyOrders(req.user._id, req.query)<br/>order.service.js"]
    S1 --> S2["getPagination(query, 10, 50)<br/>utils/pagination.js"]
    S2 --> S3["filter = { user: userId }<br/>+ status when it is a known ORDER_STATUS"]
    S3 --> S4[("Promise.all<br/>Order.find(filter).sort createdAt -1, _id -1<br/>.skip.limit.select summary fields.lean()<br/>Order.countDocuments(filter)")]
    S4 --> S5["buildMeta(page, limit, total)"]
    S5 --> OK["sendSuccess 200<br/>Orders fetched + data + meta"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/orders`), `server/src/modules/orders/order.routes.js` (route + middleware order, `/my` declared before `/:id`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/orders/order.validation.js` (`listRules`), `server/src/modules/orders/order.controller.js` (`getMyOrders`), `server/src/modules/orders/order.service.js` (`getMyOrders`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/modules/orders/order.model.js` (schema, `user + createdAt` index), `server/src/middleware/error.middleware.js` (error response).
