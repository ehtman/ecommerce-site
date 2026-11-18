```memaid
flowchart TD
    A["Client (Postman)"] --> B["app.use('/api/users', userRoutes) (app.js)"]
    B --> C["router.use(protect) (user.routes.js)"]

    C -->|Authentication Failed| ERR1["ApiError (auth.middleware.js)"]
    C -->|Authentication Successful| D["router.put('/password') (user.routes.js)"]

    D --> E["validate(changePasswordRules) (validate.middleware.js)"]
    E -->|Validation Failed| ERR2["ApiError(400)"]
    E -->|Validation Passed| F["changePassword (user.controller.js)"]

    F --> G["asyncHandler (asyncHandler.js)"]
    G --> H["changePassword(req.user._id, currentPassword, newPassword) (user.service.js)"]

    H --> I["User.findById(userId).select('+password') (user.service.js)"]
    I --> J{"user.password exists?"}

    J -->|No - Google Account| ERR3["ApiError(400)"]
    J -->|Yes| K["comparePassword(currentPassword) (user.model.js)"]

    K -->|Incorrect Password| ERR4["ApiError(401)"]
    K -->|Correct Password| L{"currentPassword === newPassword?"}

    L -->|Yes| ERR5["ApiError(400)"]
    L -->|No| M["user.password = newPassword (user.service.js)"]

    M --> N["user.save() (user.service.js)"]
    N --> O["pre('save') → hashPassword() (user.model.js)"]
    O --> P["bcrypt.hash() + Update passwordChangedAt + tokenVersion (user.model.js)"]
    P --> Q["Mongoose Validation + MongoDB Atlas"]

    Q -->|Save Failed| ERR6["Database / Validation Error"]
    Q -->|Save Successful| R["passwordChangedTemplate(user.name) (templates.js)"]
    R --> S["sendEmail() (sendEmail.js)"]
    S --> T["return user (user.service.js)"]

    T --> U["generateToken(user) (generateToken.js)"]
    U --> V["sendSuccess(res, 200, 'Password updated', { token }) (user.controller.js)"]
    V --> W["HTTP 200 → Client (Postman)"]

    ERR1 --> EH["errorHandler (error.middleware.js)"]
    ERR2 --> EH
    ERR3 --> EH
    ERR4 --> EH
    ERR5 --> EH
    ERR6 --> EH
    EH --> W
```