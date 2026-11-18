# Delete an address – `DELETE /api/addresses/:id`

Deletes one of the logged-in customer's own addresses. If it was the default, the newest remaining address becomes the default. A foreign or unknown id gives 404. Customers only; admins get 403.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/addresses/:id"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> L{"apiLimiter<br/>rateLimit.middleware.js<br/>within 300 req per 15 min?"}
    L -->|No| L429["429 response from limiter<br/>Too many attempts, try again later"]
    L429 --> R[Client]
    L -->|Yes| RT["Router /api/addresses<br/>address.routes.js<br/>router.use(protect, authorize(ROLES.CUSTOMER))"]
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
    P7 --> AZ{"authorize('customer')<br/>auth.middleware.js<br/>req.user.role is customer?"}
    AZ -->|No| E6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| OID{"validateObjectId('id')<br/>validate.middleware.js<br/>mongoose.isObjectIdOrHexString(req.params.id)?"}
    OID -->|No| E7["ApiError 400<br/>Invalid id"]
    OID -->|Yes| CT["remove<br/>address.controller.js"]
    CT --> S1["addressService.deleteAddress(req.user._id, req.params.id)<br/>address.service.js<br/>Address.findOneAndDelete({ _id: id, user: userId })"]
    S1 --> S2{Deleted an owned address?}
    S2 -->|No| E8["ApiError 404<br/>Address not found<br/>same for foreign id, never 403"]
    S2 -->|Yes| S3{"address.isDefault?"}
    S3 -->|No| OK["sendSuccess 200<br/>Address deleted, data = null"]
    S3 -->|Yes| S4["Address.findOne({ user: userId })<br/>.sort({ createdAt: -1, _id: -1 })"]
    S4 --> S5{Newest remaining address exists?}
    S5 -->|No| OK
    S5 -->|Yes| T1["makeDefault(userId, newest._id)<br/>mongoose.connection.transaction(session)"]
    T1 --> T2["Address.updateMany({ user, isDefault: true }, { isDefault: false }, { session })"]
    T2 --> T3["Address.updateOne({ _id, user }, { isDefault: true }, { session })"]
    T3 --> T4{"result.matchedCount === 0?"}
    T4 -->|Yes| E9["ApiError 404 Address not found<br/>transaction aborted, writes rolled back"]
    T4 -->|No| T5[Transaction commits]
    T5 --> OK
    OK --> R
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    E9 --> EH
    EH -->|"success false, message, errors"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/addresses`), `server/src/middleware/rateLimit.middleware.js` (`apiLimiter`), `server/src/modules/addresses/address.routes.js` (`router.use(protect, authorize)`, `DELETE /:id`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/config/constants.js` (`ROLES`), `server/src/modules/addresses/address.controller.js` (`remove`), `server/src/modules/addresses/address.service.js` (`deleteAddress`, `makeDefault`, `notFound`), `server/src/modules/addresses/address.model.js` (Address model, unique partial index), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
