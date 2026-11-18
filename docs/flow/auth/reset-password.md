# Reset password – `POST /api/auth/reset-password`

Sets a new password using the single-use token from the reset email, which also logs out every existing session, then sends a security notice. Public (rate limited); returns no token, so the user logs in again.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/reset-password| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post reset-password"]
    RT --> L1{"authLimiter<br/>under 10 per 15 min?"}
    L1 -->|No| RL
    L1 -->|Yes| V{"validate resetPasswordRules<br/>auth.validation.js<br/>token 10-200 chars, password 8-64 with letter and digit?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["resetPassword<br/>auth.controller.js via asyncHandler"]
    CT --> S1["resetPassword token, password<br/>auth.service.js"]
    S1 --> DB1["User.findByResetToken token<br/>user.model.js<br/>findOne passwordResetTokenHash = sha256 token<br/>and passwordResetExpires gt now"]
    DB1 --> D1{"User found?"}
    D1 -->|No| E2["ApiError 400<br/>Reset link is invalid or has expired"]
    D1 -->|Yes| DB2["user.password = new password<br/>clear passwordResetTokenHash and passwordResetExpires"]
    DB2 --> DB3["user.save full validation<br/>pre-save hook: bcrypt.hash, passwordChangedAt = now,<br/>tokenVersion + 1, old JWTs rejected"]
    DB3 --> M["sendEmail + passwordChangedTemplate<br/>security notice<br/>see emails/send-email.md"]
    M --> OK["sendSuccess 200<br/>Password reset successful. Please log in with your new password.<br/>data null"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, authLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (resetPasswordRules = tokenRules + passwordRule), `server/src/modules/auth/auth.controller.js` (resetPassword), `server/src/modules/auth/auth.service.js` (resetPassword), `server/src/modules/users/user.model.js` (findByResetToken, pre-save hash, tokenVersion), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (password changed notice), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
