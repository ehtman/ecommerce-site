# Update an address – `PUT /api/addresses/:id`

Replaces the fields of one of the logged-in customer's own addresses; `isDefault: true` also moves the default to it (`isDefault: false` is ignored). A foreign or unknown id gives 404. Customers only; admins get 403.

```mermaid
flowchart TD
    A[Client] -->|"PUT /api/addresses/:id"| B[Express app<br/>app.js]
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
    OID -->|Yes| V{"validate(addressRules)<br/>address.validation.js<br/>same rules as create: label, fullName, phone,<br/>addressLine1, addressLine2, city, province,<br/>postalCode, isDefault optional boolean"}
    V -->|No| E8["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["update<br/>address.controller.js"]
    CT --> S1["addressService.updateAddress(req.user._id, req.params.id, req.body)<br/>address.service.js<br/>Address.findOne({ _id: id, user: userId })"]
    S1 --> S2{Address found and owned?}
    S2 -->|No| E9["ApiError 404<br/>Address not found<br/>same for foreign id, never 403"]
    S2 -->|Yes| S3["Object.assign(address, pick(body))<br/>only the 8 allowed fields"]
    S3 --> S4["address.save()<br/>model validators run again"]
    S4 -->|Mongoose ValidationError| E10["ValidationError<br/>mapped to 400 Validation failed"]
    S4 --> S5{"body.isDefault and not address.isDefault?"}
    S5 -->|Yes| T1["makeDefault(userId, address._id)<br/>mongoose.connection.transaction(session)"]
    T1 --> T2["Address.updateMany({ user, isDefault: true }, { isDefault: false }, { session })"]
    T2 --> T3["Address.updateOne({ _id, user }, { isDefault: true }, { session })"]
    T3 --> T4{"result.matchedCount === 0?"}
    T4 -->|Yes| E11["ApiError 404 Address not found<br/>transaction aborted, writes rolled back"]
    T4 -->|No| T5[Transaction commits]
    T5 --> S6["Address.findById(address._id)<br/>re-read final state"]
    S5 -->|No| S6
    S6 --> OK["sendSuccess 200<br/>Address updated, data = address"]
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
    E10 --> EH
    E11 --> EH
    EH -->|"success false, message, errors"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/addresses`), `server/src/middleware/rateLimit.middleware.js` (`apiLimiter`), `server/src/modules/addresses/address.routes.js` (`router.use(protect, authorize)`, `PUT /:id`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/addresses/address.validation.js` (`addressRules`), `server/src/config/constants.js` (`ROLES`, `PROVINCES`, `ADDRESS_LABELS`, `REGEX`), `server/src/modules/addresses/address.controller.js` (`update`), `server/src/modules/addresses/address.service.js` (`updateAddress`, `pick`, `makeDefault`, `notFound`), `server/src/modules/addresses/address.model.js` (schema validators, unique partial index), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
