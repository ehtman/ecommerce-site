# Change password – `PUT /api/users/password`

Lets a logged-in user change their password after proving the current one. Old tokens stop working, so the response carries a fresh JWT; a security notice is emailed.

```mermaid
flowchart TD
    A[Client] -->|PUT /api/users/password| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["user.routes.js<br/>router.use protect, router.put password"]
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
    P7 --> V{"validate changePasswordRules<br/>user.validation.js<br/>currentPassword present, newPassword 8-64 with letter and digit?"}
    V -->|No| E6["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["changePassword<br/>user.controller.js via asyncHandler<br/>userId from req.user._id"]
    CT --> S1["changePassword userId, currentPassword, newPassword<br/>user.service.js"]
    S1 --> DB1["User.findById userId<br/>.select +password"]
    DB1 --> D1{"user.password set?"}
    D1 -->|No| E7["ApiError 400<br/>Google accounts do not have a password, use Forgot password"]
    D1 -->|Yes| D2{"user.comparePassword currentPassword<br/>bcrypt.compare OK?"}
    D2 -->|No| E8["ApiError 401<br/>Current password is incorrect<br/>field currentPassword"]
    D2 -->|Yes| D3{"currentPassword equals newPassword?"}
    D3 -->|Yes| E9["ApiError 400<br/>New password must be different<br/>field newPassword"]
    D3 -->|No| DB2["user.password = newPassword<br/>user.save<br/>pre-save hook: bcrypt.hash, passwordChangedAt = now, tokenVersion + 1"]
    DB2 --> M["sendEmail + passwordChangedTemplate<br/>security notice<br/>see emails/send-email.md"]
    M --> T["generateToken user<br/>utils/generateToken.js<br/>JWT with new v"]
    T --> OK["sendSuccess 200<br/>Password updated<br/>token"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    E9 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/users`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter), `server/src/modules/users/user.routes.js` (router.use(protect), route pipeline), `server/src/middleware/auth.middleware.js` (protect), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/users/user.validation.js` (changePasswordRules, reuses passwordRule from `auth.validation.js`), `server/src/modules/users/user.controller.js` (changePassword), `server/src/modules/users/user.service.js` (changePassword), `server/src/modules/users/user.model.js` (comparePassword, pre-save hash, tokenVersion), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (password changed notice), `server/src/utils/generateToken.js` (fresh JWT), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON).
