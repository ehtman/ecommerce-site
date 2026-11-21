# List all orders (admin) – `GET /api/admin/orders`

An admin lists every order, newest first, paginated (default 20, max 100), filtered by status, payment status, a date range and a search on order number or customer email. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/orders?page=&limit=&status=&paymentStatus=&from=&to=&search="| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin/orders', adminOrderRoutes)"]
    D --> P1["adminOrderRoutes.use(protect)<br/>auth.middleware.js"]
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
    VA --> VB{"status, paymentStatus known, from/to ISO dates,<br/>search max 50?"}
    VB -->|No| E7["ApiError 400<br/>Validation failed + field errors"]
    VB -->|Yes| CT["adminList<br/>order.controller.js"]
    CT --> S1["orderService.adminListOrders(req.query)<br/>order.service.js"]
    S1 --> S2["getPagination(query, 20, 100)<br/>utils/pagination.js"]
    S2 --> S3["filter: status, paymentStatus when known<br/>createdAt $gte from, $lte to 23:59:59.999Z"]
    S3 --> S4{search sent?}
    S4 -->|Yes| S5[("User.find({ email: escaped regex }).select('_id').lean()")]
    S5 --> S6["filter.$or = orderNumber regex<br/>or user $in matching ids"]
    S6 --> S7
    S4 -->|No| S7[("Promise.all<br/>Order.find(filter).sort createdAt -1, _id -1<br/>.skip.limit.select.populate('user', 'name email').lean()<br/>Order.countDocuments(filter)")]
    S7 --> S8["buildMeta(page, limit, total)"]
    S8 --> OK["sendSuccess 200<br/>Orders fetched + data + meta"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin/orders`), `server/src/modules/orders/order.routes.js` (`adminOrderRoutes` + middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/orders/order.validation.js` (`listRules`), `server/src/modules/orders/order.controller.js` (`adminList`), `server/src/modules/orders/order.service.js` (`adminListOrders`, `escapeRegex`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/modules/orders/order.model.js` (schema, indexes), `server/src/middleware/error.middleware.js` (error response).
