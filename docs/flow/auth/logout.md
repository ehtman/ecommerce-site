# Logout – `POST /api/auth/logout`

Confirms logout for a logged-in user. JWTs are stateless, so the server deletes nothing: the client simply drops its token. Requires a valid Bearer token.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/logout| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post logout"]
    RT --> P1{"protect<br/>auth.middleware.js<br/>Authorization Bearer token present?"}
    P1 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify token, JWT_SECRET<br/>signature and expiry OK?"}
    P2 -->|No| E2["ApiError 401<br/>Not authorised, token invalid or expired"]
    P2 -->|Yes| P3["User.findById payload.id"]
    P3 --> P4{"User exists?"}
    P4 -->|No| E3["ApiError 401<br/>Not authorised, user no longer exists"]
    P4 -->|Yes| P5{"user.isActive?"}
    P5 -->|No| E4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated payload.v?"}
    P6 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| P7["req.user = user"]
    P7 --> CT["logout<br/>auth.controller.js via asyncHandler<br/>no DB work, stateless JWT"]
    CT --> OK["sendSuccess 200<br/>Logged out<br/>data null"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/auth.middleware.js` (protect), `server/src/modules/users/user.model.js` (isTokenOutdated), `server/src/modules/auth/auth.controller.js` (logout), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
