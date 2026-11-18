```memaid
flowchart TD
    A["Client (Postman)"] --> B["app.use('/api/users', userRoutes) (app.js)"]
    B --> C["router.use(protect) (user.routes.js)"]

    C -->|Authentication Failed| ERR["ApiError (auth.middleware.js)"]
    ERR --> EH["errorHandler (error.middleware.js)"]

    C -->|Authentication Successful| D["router.get('/profile', getProfile) (user.routes.js)"]
    D --> E["req.user (auth.middleware.js)"]
    E --> F["getProfile (user.controller.js)"]
    F --> G["asyncHandler (asyncHandler.js)"]
    G --> H["sendSuccess(res, 200, 'Profile fetched', req.user) (ApiResponse.js)"]
    H --> I["HTTP 200 → Client (Postman)"]

    EH --> I
```