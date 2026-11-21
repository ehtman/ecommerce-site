# Register customer – `POST /api/auth/register`

Public sign-up with name, email and password. Always creates a `customer`, and since branch 05 creates the user, an empty cart and an empty wishlist in ONE MongoDB transaction (all or nothing), then emails a verification link.

```mermaid
flowchart TD
    A[Client] -->|POST /api/auth/register| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter 300 / 15 min or<br/>authLimiter 10 / 15 min exceeded?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| V{"validate registerRules<br/>name 2-50, email, password 8-64 letter + digit"}
    V -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["auth.controller.js register"]
    CT --> S1["authService.registerUser<br/>User.exists email"]
    S1 --> D1{"Email already registered?"}
    D1 -->|Yes| E1["ApiError 409<br/>Email already registered"]
    D1 -->|No| TX
    TX["createUserWithCartAndWishlist<br/>mongoose.connection.transaction session"]
    TX --> T1["new User data<br/>user.createEmailVerifyToken if authProvider local"]
    T1 --> T2["user.save session<br/>pre-save hook hashes password"]
    T2 --> T3["Cart.create user, items empty, session"]
    T3 --> T4["Wishlist.create user, products empty, session"]
    T4 --> TOK{"All three writes OK?"}
    TOK -->|No| TAB["Transaction ABORTED<br/>all writes rolled back"]
    TAB --> ETX["Error rethrown<br/>ValidationError 400 / duplicate key 11000 409"]
    TOK -->|Yes| TCM["Transaction COMMITTED<br/>user + cart + wishlist saved together"]
    TCM --> M["sendEmail to user.email<br/>verifyEmailTemplate name, verifyToken"]
    M --> GT["generateToken user<br/>withToken"]
    GT --> S["sendSuccess 201<br/>Registration successful, check your email<br/>token + user"]
    S --> R
    EV --> EH
    E1 --> EH
    ETX --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/auth, apiLimiter), `server/src/modules/auth/auth.routes.js` (authLimiter, validate), `server/src/middleware/rateLimit.middleware.js` (authLimiter), `server/src/middleware/validate.middleware.js` (validate), `server/src/modules/auth/auth.validation.js` (registerRules), `server/src/modules/auth/auth.controller.js` (register, withToken), `server/src/modules/auth/auth.service.js` (registerUser, createUserWithCartAndWishlist transaction), `server/src/modules/users/user.model.js` (password hash hook, createEmailVerifyToken), `server/src/modules/cart/cart.model.js` (Cart), `server/src/modules/wishlist/wishlist.model.js` (Wishlist), `server/src/emails/sendEmail.js` + `server/src/emails/templates.js` (verifyEmailTemplate), `server/src/utils/generateToken.js` (JWT), `server/src/middleware/error.middleware.js` (errorHandler)
