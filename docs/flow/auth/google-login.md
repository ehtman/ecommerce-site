# Google login – `POST /api/auth/google`

Signs a customer in (or signs them up) with the ID token from Google's sign-in button: verifies it with Google, then finds, links or creates the user and returns a JWT. Public (rate limited); admins are refused.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/google| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, express.json, urlencoded, mongoSanitize, morgan"]
    C --> L0{"apiLimiter<br/>rateLimit.middleware.js<br/>under 300 per 15 min?"}
    L0 -->|No| RL["429 Too many attempts, try again later<br/>sent by express-rate-limit"]
    L0 -->|Yes| RT["auth.routes.js<br/>router.post google"]
    RT --> L1{"authLimiter<br/>under 10 per 15 min?"}
    L1 -->|No| RL
    L1 -->|Yes| V{"validate googleRules<br/>auth.validation.js<br/>credential non-empty string?"}
    V -->|No| E1["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["googleLogin<br/>auth.controller.js via asyncHandler"]
    CT --> S1["googleLogin credential<br/>auth.service.js"]
    S1 --> D0{"env.GOOGLE_CLIENT_ID set?"}
    D0 -->|No| E2["ApiError 500<br/>Google login is not configured"]
    D0 -->|Yes| G["googleVerifier.verify<br/>google.verifier.js<br/>OAuth2Client.verifyIdToken, audience GOOGLE_CLIENT_ID"]
    G --> GX[Google auth library<br/>checks signature with Google public keys]
    GX --> D1{"Token valid?"}
    D1 -->|No, throws| E3["ApiError 401<br/>Invalid Google credential"]
    D1 -->|Yes| D2{"payload.email_verified?"}
    D2 -->|No| E4["ApiError 401<br/>Google email is not verified"]
    D2 -->|Yes| DB1["email = payload.email lowercased<br/>User.findOne googleId = payload.sub"]
    DB1 --> D3{"Linked user found?"}
    D3 -->|Yes| D7
    D3 -->|No| DB2["User.findOne email"]
    DB2 --> D4{"Same email user found?"}
    D4 -->|Yes| D5{"user.role is admin?"}
    D5 -->|Yes| E5["ApiError 403<br/>Admins must log in with email and password"]
    D5 -->|No| DB3["Link account<br/>user.googleId = sub, isEmailVerified = true<br/>user.save validateModifiedOnly"]
    DB3 --> D7
    D4 -->|No| DB4["createUser<br/>name from payload.name or email prefix, max 50<br/>authProvider google, googleId sub"]
    DB4 --> DB5["user.save<br/>pre-validate hook sets isEmailVerified true<br/>no password, no verify token"]
    DB5 --> D6{"Duplicate key 11000?"}
    D6 -->|Yes| E6["MongoServerError 11000<br/>mapped to 409 field already exists"]
    D6 -->|No| D7{"user.role is admin?"}
    D7 -->|Yes| E7["ApiError 403<br/>Admins must log in with email and password"]
    D7 -->|No| D8{"user.isActive?"}
    D8 -->|No| E8["ApiError 403<br/>Your account has been disabled"]
    D8 -->|Yes| DB6["user.lastLoginAt = now<br/>user.save validateModifiedOnly"]
    DB6 --> T["withToken: generateToken user<br/>utils/generateToken.js<br/>JWT id, role, v"]
    T --> OK["sendSuccess 200<br/>Login successful<br/>token + user"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    EH --> R
    RL --> R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/auth`), `server/src/middleware/rateLimit.middleware.js` (apiLimiter, authLimiter), `server/src/modules/auth/auth.routes.js` (route pipeline), `server/src/middleware/validate.middleware.js` (runs rules), `server/src/modules/auth/auth.validation.js` (googleRules), `server/src/modules/auth/auth.controller.js` (googleLogin), `server/src/modules/auth/auth.service.js` (googleLogin, createUser), `server/src/modules/auth/google.verifier.js` (Google ID token check via google-auth-library), `server/src/modules/users/user.model.js` (pre-validate googleVerified hook), `server/src/config/env.js` (GOOGLE_CLIENT_ID), `server/src/utils/generateToken.js` (JWT), `server/src/utils/ApiResponse.js` (sendSuccess), `server/src/utils/ApiError.js`, `server/src/middleware/error.middleware.js` (error JSON; 500 message hidden in production).
