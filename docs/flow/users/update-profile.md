# Update my profile – `PUT /api/users/profile`

Partially updates the logged-in user's own `name` and/or `phone`. Any logged-in user (customer or admin) may call it; every other body field (role, email, isEmailVerified...) is ignored.

```mermaid
flowchart TD
    A[Client] -->|PUT /api/users/profile| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> L{"apiLimiter<br/>rateLimit.middleware.js<br/>within 300 req per 15 min?"}
    L -->|No| L429["429 response from limiter<br/>Too many attempts, try again later"]
    L429 --> R[Client]
    L -->|Yes| RT["Router /api/users<br/>user.routes.js<br/>router.use(protect)"]
    RT --> P1{"protect<br/>auth.middleware.js<br/>Authorization: Bearer token?"}
    P1 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify(token, JWT_SECRET)<br/>valid and not expired?"}
    P2 -->|No| E2["ApiError 401<br/>Not authorised, token invalid or expired"]
    P2 -->|Yes| P3["User.findById(payload.id)"]
    P3 --> P4{User found?}
    P4 -->|No| E3["ApiError 401<br/>Not authorised, user no longer exists"]
    P4 -->|Yes| P5{user.isActive?}
    P5 -->|No| E4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated(payload.v)?"}
    P6 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| P7["req.user = user"]
    P7 --> V{"validate(updateProfileRules)<br/>validate.middleware.js + user.validation.js<br/>name optional: string, trim, 2-50 chars<br/>phone optional, empty or null allowed: string, trim, 03XXXXXXXXX"}
    V -->|No| E6["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["updateProfile<br/>user.controller.js"]
    CT --> S1["userService.updateProfile(req.user._id, req.body)<br/>user.service.js<br/>User.findById(userId)"]
    S1 --> S2{"name !== undefined?"}
    S2 -->|Yes| S3["user.name = name"]
    S2 -->|No| S4{"phone !== undefined?"}
    S3 --> S4
    S4 -->|Yes| S5["user.phone = phone, or undefined if empty or null<br/>clears the phone field"]
    S4 -->|No| S6["user.save({ validateModifiedOnly: true })<br/>only name and phone are ever copied"]
    S5 --> S6
    S6 -->|Mongoose ValidationError| E7["ValidationError<br/>mapped to 400 Validation failed"]
    S6 --> OK["sendSuccess 200<br/>Profile updated, data = user"]
    OK --> R
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    EH -->|"success false, message, errors"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/users`), `server/src/middleware/rateLimit.middleware.js` (`apiLimiter`), `server/src/modules/users/user.routes.js` (`router.use(protect)`, `PUT /profile`), `server/src/middleware/auth.middleware.js` (`protect`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/users/user.validation.js` (`updateProfileRules`), `server/src/config/constants.js` (`REGEX.PK_PHONE`), `server/src/modules/users/user.controller.js` (`updateProfile`), `server/src/modules/users/user.service.js` (`updateProfile`, mass-assignment protection), `server/src/modules/users/user.model.js` (new optional `phone` field), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
