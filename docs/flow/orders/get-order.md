# Get one order – `GET /api/orders/:id`

Reads one full order. The owner (customer) or any admin may call it; there is no `authorize()` on the route, the service decides. Another customer's order answers 404, never 403, so ids leak nothing.

```mermaid
flowchart TD
    A[Client] -->|GET /api/orders/:id| B[Express app<br/>app.js]
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
    P7 -->|No| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E6["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| CT["getOrderById<br/>order.controller.js"]
    CT --> S1["orderService.getOrderById(req.user, req.params.id)<br/>order.service.js"]
    S1 --> S2{"user.role === admin?"}
    S2 -->|Yes| S3["filter = { _id: id }"]
    S2 -->|No| S4["filter = { _id: id, user: user._id }"]
    S3 --> S5[("Order.findOne(filter)<br/>.populate('user', 'name email phone')<br/>.populate('statusHistory.changedBy', 'name role')")]
    S4 --> S5
    S5 --> S6{Order found?}
    S6 -->|No| E7["ApiError 404<br/>Order not found"]
    S6 -->|Yes| OK["sendSuccess 200<br/>Order fetched + order"]
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/orders`), `server/src/modules/orders/order.routes.js` (route + middleware order), `server/src/middleware/auth.middleware.js` (`protect`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/orders/order.controller.js` (`getOrderById`), `server/src/modules/orders/order.service.js` (`getOrderById`, ownership filter), `server/src/modules/orders/order.model.js` (schema), `server/src/middleware/error.middleware.js` (error response).
