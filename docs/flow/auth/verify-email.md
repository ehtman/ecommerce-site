# Verify email – `POST /api/auth/verify-email`

Marks the account's email as verified using the single-use token from the verification email. Public: the user arrives from the link in their mailbox (the frontend page posts the token).

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/verify-email| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post verify-email"]
    RT --> V{"validate tokenRules<br/>auth.validation.js<br/>token string 10-200 chars?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["verifyEmail<br/>auth.controller.js via asyncHandler"]
    CT --> S1["verifyEmail token<br/>auth.service.js"]
    S1 --> DB1["User.findByEmailToken token<br/>user.model.js<br/>findOne emailVerifyTokenHash = sha256 token<br/>and emailVerifyExpires gt now"]
    DB1 --> D1{"User found?"}
    D1 -->|No| E2["ApiError 400<br/>Verification link is invalid or has expired"]
    D1 -->|Yes| DB2["isEmailVerified = true<br/>clear emailVerifyTokenHash and emailVerifyExpires<br/>user.save validateModifiedOnly"]
    DB2 --> OK["sendSuccess 200<br/>Email verified successfully<br/>user"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline, no extra limiter), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (tokenRules), `server/src/modules/auth/auth.controller.js` (verifyEmail), `server/src/modules/auth/auth.service.js` (verifyEmail), `server/src/modules/users/user.model.js` (findByEmailToken, sha256), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
