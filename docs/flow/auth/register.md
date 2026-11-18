# Register – `POST /api/auth/register`

Creates a new customer account with name, email and password, emails a verification link and returns a login token. Public: anyone may call it (rate limited).

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/register| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post register"]
    RT --> L1{"authLimiter<br/>under 10 per 15 min?"}
    L1 -->|No| RL
    L1 -->|Yes| V{"validate registerRules<br/>validate.middleware.js + auth.validation.js<br/>name 2-50, email valid, password 8-64 with letter and digit?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["register<br/>auth.controller.js via asyncHandler"]
    CT --> S1["registerUser name, email, password<br/>auth.service.js"]
    S1 --> D1{"User.exists email<br/>already registered?"}
    D1 -->|Yes| E2["ApiError 409<br/>Email already registered"]
    D1 -->|No| S2["createUser<br/>new User with role customer<br/>other body fields ignored"]
    S2 --> S3["user.createEmailVerifyToken<br/>user.model.js<br/>stores sha256 hash + 24h expiry"]
    S3 --> S4["user.save<br/>pre-save hook bcrypt.hash password"]
    S4 --> D2{"Duplicate key 11000<br/>email raced in?"}
    D2 -->|Yes| E3["MongoServerError 11000<br/>mapped to 409 email already exists"]
    D2 -->|No| M["sendEmail + verifyEmailTemplate<br/>link FRONTEND_URL/verify-email?token=...<br/>see emails/send-email.md"]
    M --> T["withToken: generateToken user<br/>utils/generateToken.js<br/>JWT id, role, v"]
    T --> OK["sendSuccess 201<br/>Registration successful, check your email<br/>token + user, secrets hidden by toJSON"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, authLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (registerRules, passwordRule), `server/src/modules/auth/auth.controller.js` (register, withToken), `server/src/modules/auth/auth.service.js` (registerUser, createUser), `server/src/modules/users/user.model.js` (createEmailVerifyToken, pre-save hash), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (verification email), `server/src/utils/generateToken.js` (JWT), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON, 11000 to 409).
