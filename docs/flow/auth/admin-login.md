# Admin login – `POST /api/auth/admin/login`

Same email and password check as user login, but only accounts with role `admin` get a token, and the rate limit is stricter. Public endpoint for the admin panel.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/admin/login| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post admin/login"]
    RT --> L1{"adminLoginLimiter<br/>under 5 per 15 min?"}
    L1 -->|No| RL
    L1 -->|Yes| V{"validate loginRules<br/>auth.validation.js<br/>email valid, password present?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["adminLogin<br/>auth.controller.js via asyncHandler"]
    CT --> S1["loginUser email, password, requireAdmin true<br/>auth.service.js"]
    S1 --> DB1["User.findOne email<br/>.select +password"]
    DB1 --> D1{"User found and<br/>user.comparePassword bcrypt.compare?"}
    D1 -->|No| E2["ApiError 401<br/>Invalid email or password"]
    D1 -->|Yes| D2{"user.isActive?"}
    D2 -->|No| E3["ApiError 403<br/>Your account has been disabled"]
    D2 -->|Yes| D3{"user.role is admin?"}
    D3 -->|No| E4["ApiError 403<br/>Admin access only"]
    D3 -->|Yes| DB2["user.lastLoginAt = now<br/>user.save validateModifiedOnly"]
    DB2 --> T["withToken: generateToken user<br/>utils/generateToken.js<br/>JWT id, role admin, v"]
    T --> OK["sendSuccess 200<br/>Login successful<br/>token + user"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, adminLoginLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (loginRules), `server/src/modules/auth/auth.controller.js` (adminLogin), `server/src/modules/auth/auth.service.js` (loginUser with requireAdmin), `server/src/modules/users/user.model.js` (comparePassword), `server/src/utils/generateToken.js` (JWT), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
