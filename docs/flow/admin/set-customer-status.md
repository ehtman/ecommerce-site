# Activate or deactivate a customer (admin) – `PATCH /api/admin/users/:id/status`

An admin switches a customer account on or off with `{ isActive: true|false }`. An admin cannot change their own status and admin accounts cannot be changed here. A deactivated customer is locked out at once, because `protect` reloads the user on every request. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"PATCH /api/admin/users/:id/status"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin', adminRoutes)"]
    D --> G0["router.use(protect, authorize(ROLES.ADMIN))<br/>admin.routes.js, guards every admin route"]
    G0 --> P1["protect<br/>auth.middleware.js"]
    P1 --> P2{"Bearer token<br/>in header?"}
    P2 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P2 -->|Yes| P3{"jwt.verify OK?"}
    P3 -->|No| E2["ApiError 401<br/>token invalid or expired"]
    P3 -->|Yes| P4[("User.findById(payload.id)")]
    P4 --> P5{User exists?}
    P5 -->|No| E3["ApiError 401<br/>user no longer exists"]
    P5 -->|Yes| P6{user.isActive?}
    P6 -->|No| E4["ApiError 403<br/>Account disabled"]
    P6 -->|Yes| P7{"user.isTokenOutdated(payload.v)?"}
    P7 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P7 -->|No| Z1["authorize(ROLES.ADMIN)<br/>auth.middleware.js"]
    Z1 --> Z2{role is admin?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7["ApiError 400<br/>Invalid id"]
    O2 -->|Yes| V1["validate(statusRules)<br/>admin.validation.js"]
    V1 --> V2{"isActive is a real JSON boolean?<br/>the text false or 0 is refused"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>isActive must be true or false"]
    V2 -->|Yes| CT["setCustomerStatus<br/>admin.controller.js"]
    CT --> S1["adminService.setCustomerStatus(req.user._id, req.params.id, req.body.isActive)<br/>admin.service.js"]
    S1 --> S2{"id is the admin's own id?"}
    S2 -->|Yes| E8["ApiError 400<br/>You cannot change your own status"]
    S2 -->|No| S3[("User.findById(id)")]
    S3 --> S4{User found?}
    S4 -->|No| E9["ApiError 404<br/>Customer not found"]
    S4 -->|Yes| S5{"user.role is admin?"}
    S5 -->|Yes| E10["ApiError 400<br/>Admin accounts cannot be deactivated here"]
    S5 -->|No| S6["user.isActive = isActive"]
    S6 --> S7[("user.save({ validateModifiedOnly: true })")]
    S7 --> S8{"user.isActive?"}
    S8 -->|true| OK1["sendSuccess 200 Customer activated<br/>user"]
    S8 -->|false| OK2["sendSuccess 200 Customer deactivated<br/>user"]
    OK1 --> R[Client]
    OK2 --> R
    S7 -.->|"effect on the customer's next request"| N1["protect reloads the user every request<br/>inactive account gets 403 Account disabled"]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    EV --> EH
    E8 --> EH
    E9 --> EH
    E10 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/admin/admin.validation.js` (`statusRules`), `server/src/modules/admin/admin.controller.js` (`setCustomerStatus`), `server/src/modules/admin/admin.service.js` (`setCustomerStatus`), `server/src/config/constants.js` (`ROLES`), `server/src/modules/users/user.model.js` (saved), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
