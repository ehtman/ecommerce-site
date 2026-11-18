# Get my profile – `GET /api/users/profile`

Returns the logged-in user's own profile. Any logged-in user (customer or admin) may call it; there is no `:id`, the user always comes from the token.

```mermaid
flowchart TD
    A[Client] -->|GET /api/users/profile| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> L{"apiLimiter<br/>rateLimit.middleware.js<br/>within 300 req per 15 min?"}
    L -->|No| L429["429 response from limiter<br/>Too many attempts, try again later"]
    L429 --> R[Client]
    L -->|Yes| RT["Router /api/users<br/>user.routes.js<br/>router.use(protect)"]
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
    P6 -->|No| P7["req.user = user<br/>next()"]
    P7 --> CT["getProfile<br/>user.controller.js<br/>no extra DB lookup"]
    CT --> OK["sendSuccess 200<br/>Profile fetched, data = req.user<br/>toJSON plugin hides secrets"]
    OK --> R
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    EH -->|"success false, message"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/users`), `server/src/middleware/rateLimit.middleware.js` (`apiLimiter`), `server/src/modules/users/user.routes.js` (`router.use(protect)`, `GET /profile`), `server/src/middleware/auth.middleware.js` (`protect`), `server/src/modules/users/user.controller.js` (`getProfile`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/db/plugins/toJSON.js` (strips hidden fields), `server/src/middleware/error.middleware.js` (`errorHandler`).
