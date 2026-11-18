# Forgot password – `POST /api/auth/forgot-password`

Emails a password-reset link to an active email+password account. Public; always answers with the same 200 message whether or not the email exists, so it cannot be used to discover accounts.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/forgot-password| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post forgot-password"]
    RT --> L1{"emailLimiter<br/>under 5 per hour?"}
    L1 -->|No| RL
    L1 -->|Yes| V{"validate emailOnlyRules<br/>auth.validation.js<br/>email valid?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["forgotPassword<br/>auth.controller.js via asyncHandler"]
    CT --> S1["forgotPassword email<br/>auth.service.js"]
    S1 --> DB1["User.findOne email,<br/>authProvider local, isActive true"]
    DB1 --> D1{"User found?"}
    D1 -->|No| SKIP["return early<br/>no token, no email"]
    D1 -->|Yes| DB2["user.createPasswordResetToken<br/>user.model.js<br/>sha256 hash + 30 min expiry<br/>user.save validateModifiedOnly"]
    DB2 --> M["sendEmail + resetPasswordTemplate<br/>link FRONTEND_URL/reset-password?token=...<br/>see emails/send-email.md"]
    M --> OK
    SKIP --> OK["sendSuccess 200<br/>If an account exists for this email, a reset link has been sent<br/>data null"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, emailLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (emailOnlyRules), `server/src/modules/auth/auth.controller.js` (forgotPassword), `server/src/modules/auth/auth.service.js` (forgotPassword), `server/src/modules/users/user.model.js` (createPasswordResetToken), `server/src/config/constants.js` (TOKEN_TTL), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (reset email), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
