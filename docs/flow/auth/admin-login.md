```memaid
flowchart TD
    A["Client (Postman)"] --> B["app.use('/api/auth', authRoutes) (app.js)"]
    B --> C["router.post('/login') (auth.routes.js)"]
    C --> D["apiLimiter (rateLimit.middleware.js)"]
    D --> E["authLimiter (rateLimit.middleware.js)"]
    E --> F["validate(v.loginRules) (validate.middleware.js)"]

    F -->|Validation Failed| ERR1["ApiError(400)"]
    ERR1 --> EH["errorHandler (error.middleware.js)"]

    F -->|Validation Passed| G["login (auth.controller.js)"]
    G --> H["asyncHandler (asyncHandler.js)"]
    H --> I["loginUser(email, password) (auth.service.js)"]
    I --> J["User.findOne({ email }).select('+password') (user.model.js)"]

    J -->|User Not Found| ERR2["ApiError(401)"]
    J -->|User Found| K["comparePassword(password) (user.model.js)"]

    K -->|Incorrect Password| ERR3["ApiError(401)"]
    K -->|Correct Password| L{"user.isActive? (auth.service.js)"}

    L -->|No| ERR4["ApiError(403) Account Disabled"]
    L -->|Yes| M["Update lastLoginAt (auth.service.js)"]

    M --> N["user.save() (auth.service.js)"]
    N -->|Save Failed| EH
    N -->|Save Successful| O["return user (auth.service.js)"]

    O --> P["withToken(user) (auth.controller.js)"]
    P --> Q["generateToken(user) (generateToken.js)"]
    Q --> R["sendSuccess(res, 200, ...) (ApiResponse.js)"]
    R --> S["HTTP 200 → Client (Postman)"]

    ERR2 --> EH
    ERR3 --> EH
    ERR4 --> EH
```