# Resend verification email – `POST /api/auth/resend-verification`

Creates a new email-verification token (replacing the old one) and emails a fresh link. Logged-in users only; limited to 5 emails per hour.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/resend-verification| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post resend-verification"]
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
    P7 --> L1{"emailLimiter<br/>under 5 per hour?"}
    L1 -->|No| RL
    L1 -->|Yes| CT["resendVerification<br/>auth.controller.js via asyncHandler"]
    CT --> S1["resendVerification req.user._id<br/>auth.service.js"]
    S1 --> DB1["User.findById userId"]
    DB1 --> D1{"user.isEmailVerified?"}
    D1 -->|Yes| E6["ApiError 400<br/>Email is already verified"]
    D1 -->|No| DB2["user.createEmailVerifyToken<br/>new sha256 hash + 24h expiry<br/>user.save validateModifiedOnly"]
    DB2 --> M["sendEmail + verifyEmailTemplate<br/>link FRONTEND_URL/verify-email?token=...<br/>see emails/send-email.md"]
    M --> OK["sendSuccess 200<br/>Verification email sent<br/>data null"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, emailLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline: protect then emailLimiter), `server/src/middleware/auth.middleware.js` (protect), `server/src/modules/auth/auth.controller.js` (resendVerification), `server/src/modules/auth/auth.service.js` (resendVerification), `server/src/modules/users/user.model.js` (createEmailVerifyToken, isTokenOutdated), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (verification email), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
