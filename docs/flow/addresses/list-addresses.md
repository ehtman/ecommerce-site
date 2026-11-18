# List my addresses – `GET /api/addresses`

Returns all of the logged-in customer's saved addresses, default first, then newest first. Customers only; admins get 403.

```mermaid
flowchart TD
    A[Client] -->|GET /api/addresses| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> L{"apiLimiter<br/>rateLimit.middleware.js<br/>within 300 req per 15 min?"}
    L -->|No| L429["429 response from limiter<br/>Too many attempts, try again later"]
    L429 --> R[Client]
    L -->|Yes| RT["Router /api/addresses<br/>address.routes.js<br/>router.use(protect, authorize(ROLES.CUSTOMER))"]
    RT --> P1{"protect<br/>auth.middleware.js<br/>Authorization: Bearer token?"}
    P1 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify(token, JWT_SECRET)<br/>valid and not expired?"}
    P2 -->|No| E2["ApiError 401<br/>Not authorised, token invalid or expired"]
    P2 -->|Yes| P3["User.findById(payload.id)"]
    P3 --> P4{User found?}
    P4 -->|No| E3["ApiError 401<br/>Not authorised, user no longer exists"]
    P4 -->|Yes| P5{user.isActive?}
    P5 -->|No| E4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated(payload.v)?"}
    P6 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| P7["req.user = user"]
    P7 --> AZ{"authorize('customer')<br/>auth.middleware.js<br/>req.user.role is customer?"}
    AZ -->|No| E6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| CT["list<br/>address.controller.js"]
    CT --> S1["addressService.listAddresses(req.user._id)<br/>address.service.js"]
    S1 --> DB["Address.find({ user: userId })<br/>.sort({ isDefault: -1, createdAt: -1, _id: -1 })<br/>owner filter = authorization"]
    DB --> OK["sendSuccess 200<br/>Addresses fetched, data = array, may be empty"]
    OK --> R
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EH -->|"success false, message"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/addresses`), `server/src/middleware/rateLimit.middleware.js` (`apiLimiter`), `server/src/modules/addresses/address.routes.js` (`router.use(protect, authorize)`, `GET /`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/config/constants.js` (`ROLES`), `server/src/modules/addresses/address.controller.js` (`list`), `server/src/modules/addresses/address.service.js` (`listAddresses`), `server/src/modules/addresses/address.model.js` (Address model, `{ user: 1, createdAt: -1 }` index), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
