# Google sign-in / sign-up – `POST /api/auth/google`

Public sign-in with a Google ID token. Finds the user by Google id, links an existing email account, or creates a new customer; since branch 05 a new Google customer is created together with an empty cart and wishlist in ONE MongoDB transaction. Admins are refused.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/google| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter 300 / 15 min or<br/>authLimiter 10 / 15 min exceeded?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| V{"validate googleRules<br/>credential non-empty string"}
    V -->|No| EV["ApiError 400<br/>Validation failed"]
    V -->|Yes| CT["auth.controller.js googleLogin"]
    CT --> S0{"authService.googleLogin<br/>env.GOOGLE_CLIENT_ID set?"}
    S0 -->|No| E0["ApiError 500<br/>Google login is not configured"]
    S0 -->|Yes| GV["googleVerifier.verify credential<br/>google.verifier.js<br/>OAuth2Client.verifyIdToken audience GOOGLE_CLIENT_ID"]
    GV --> GOK{"Google accepts token?"}
    GOK -->|No| E1["ApiError 401<br/>Invalid Google credential"]
    GOK -->|Yes| EVF{"payload.email_verified?"}
    EVF -->|No| E2["ApiError 401<br/>Google email is not verified"]
    EVF -->|Yes| F1["User.findOne googleId = payload.sub"]
    F1 --> D1{"Linked user found?"}
    D1 -->|Yes| CHK
    D1 -->|No| F2["User.findOne email lowercased"]
    F2 --> D2{"User with same email?"}
    D2 -->|Yes| D3{"role is admin?"}
    D3 -->|Yes| E3["ApiError 403<br/>Admins must log in with email and password"]
    D3 -->|No| LK["Link: user.googleId = sub, isEmailVerified true<br/>user.save validateModifiedOnly"]
    LK --> CHK
    D2 -->|No| TX
    TX["createUserWithCartAndWishlist<br/>mongoose.connection.transaction session"]
    TX --> T1["new User data<br/>name, email, googleId, authProvider google, avatar<br/>no verify token for google"]
    T1 --> T2["user.save session<br/>pre-validate hook sets isEmailVerified, no password to hash"]
    T2 --> T3["Cart.create user, items empty, session"]
    T3 --> T4["Wishlist.create user, products empty, session"]
    T4 --> TOK{"All three writes OK?"}
    TOK -->|No| TAB["Transaction ABORTED<br/>all writes rolled back"]
    TAB --> ETX["Error rethrown<br/>ValidationError 400 / duplicate key 11000 409"]
    TOK -->|Yes| TCM["Transaction COMMITTED<br/>user + cart + wishlist saved together"]
    TCM --> CHK{"user.role is admin?"}
    CHK -->|Yes| E4["ApiError 403<br/>Admins must log in with email and password"]
    CHK -->|No| ACT{"user.isActive?"}
    ACT -->|No| E5["ApiError 403<br/>Your account has been disabled"]
    ACT -->|Yes| LL["user.lastLoginAt = now<br/>user.save validateModifiedOnly"]
    LL --> GT["generateToken user<br/>withToken"]
    GT --> S["sendSuccess 200 Login successful<br/>token + user"]
    S --> R
    EV --> EH
    E0 --> EH
    E1 --> EH
    E2 --> EH
    E3 --> EH
    ETX --> EH
    E4 --> EH
    E5 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/auth, apiLimiter), `server/src/modules/auth/auth.routes.js` (authLimiter, validate), `server/src/middleware/rateLimit.middleware.js` (authLimiter), `server/src/modules/auth/auth.validation.js` (googleRules), `server/src/modules/auth/auth.controller.js` (googleLogin, withToken), `server/src/modules/auth/auth.service.js` (googleLogin, createUserWithCartAndWishlist transaction), `server/src/modules/auth/google.verifier.js` (Google OAuth2Client), `server/src/modules/users/user.model.js` (User, googleVerified pre-validate hook), `server/src/modules/cart/cart.model.js` (Cart), `server/src/modules/wishlist/wishlist.model.js` (Wishlist), `server/src/utils/generateToken.js` (JWT), `server/src/middleware/error.middleware.js` (errorHandler)
