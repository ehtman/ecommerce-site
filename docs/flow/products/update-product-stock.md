# Update product stock – `PATCH /api/products/:id/stock`

Admin only: a manual stock change with a reason, recorded in the product's stock history (last 50 kept). `mode: 'adjust'` sends a change (+20 / -3), `mode: 'set'` sends the new total; both become one atomic `$inc` that can never take the stock below zero.

```mermaid
flowchart TD
    A[Client] -->|PATCH /api/products/:id/stock| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[productRoutes<br/>product.routes.js]
    D --> P1{"protect<br/>auth.middleware.js<br/>Bearer token in Authorization header?"}
    P1 -->|No| X1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify(token, JWT_SECRET) ok?"}
    P2 -->|No| X2["ApiError 401<br/>Not authorised, token invalid or expired"]
    P2 -->|Yes| P3{"User.findById(payload.id) found?"}
    P3 -->|No| X3["ApiError 401<br/>Not authorised, user no longer exists"]
    P3 -->|Yes| P4{user.isActive?}
    P4 -->|No| X4["ApiError 403<br/>Account disabled"]
    P4 -->|Yes| P5{"user.isTokenOutdated(payload.v)?"}
    P5 -->|Yes| X5["ApiError 401<br/>Password was changed, please log in again"]
    P5 -->|No| P6{"authorize('admin')<br/>req.user.role is admin?"}
    P6 -->|No| X6["ApiError 403<br/>Access denied"]
    P6 -->|Yes| VO{"validateObjectId('id')<br/>validate.middleware.js<br/>24-hex ObjectId?"}
    VO -->|No| X7["ApiError 400<br/>Invalid id (field: id)"]
    VO -->|Yes| V{"validate(stockRules)<br/>product.validation.js<br/>mode adjust or set, value whole number,<br/>reason 3-100 chars?"}
    V -->|No| X8["ApiError 400<br/>Validation failed + errors: field, message"]
    V -->|Yes| F["updateStock<br/>product.controller.js (asyncHandler)"]
    F --> G["productService.updateStock(req.user._id, id, { mode, value, reason })<br/>product.service.js"]
    G --> H{"mode is set and value below 0?"}
    H -->|Yes| X9["ApiError 400<br/>Stock cannot be negative"]
    H -->|No| I{"Product.findById(id).select('stock') found?"}
    I -->|No| X10["ApiError 404<br/>Product not found"]
    I -->|Yes| J["change = mode set ? value - product.stock : value"]
    J --> K{change is 0?}
    K -->|Yes| X11["ApiError 400<br/>Stock is already at this value"]
    K -->|No| L["Product.adjustStock(id, change, reason, adminId)<br/>product.model.js static<br/>findOneAndUpdate filter: _id + stock $gte (change negative ? -change : 0)<br/>update: $inc stock by change,<br/>$push stockHistory $each [change, reason, by] $slice -50<br/>options: new true, runValidators true"]
    L --> L1{Validators pass?}
    L1 -->|No| X12["Mongoose ValidationError<br/>errorHandler turns it into 400 Validation failed"]
    L1 -->|Yes| M{"updated document returned?"}
    M -->|"No (stock too low)"| X13["ApiError 400<br/>Stock cannot go below zero"]
    M -->|Yes| S["sendSuccess 200<br/>Stock updated + data: _id, stock"]
    S --> R[Client]
    X1 --> EH["errorHandler<br/>error.middleware.js"]
    X2 --> EH
    X3 --> EH
    X4 --> EH
    X5 --> EH
    X6 --> EH
    X7 --> EH
    X8 --> EH
    X9 --> EH
    X10 --> EH
    X11 --> EH
    X12 --> EH
    X13 --> EH
```

**Files involved:** `server/src/app.js` (mounts `/api/products`, global middleware), `server/src/modules/products/product.routes.js` (`PATCH /:id/stock` with `protect`, `authorize(ROLES.ADMIN)`, `validateObjectId('id')`, `validate(stockRules)`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/products/product.validation.js` (`stockRules`), `server/src/modules/products/product.controller.js` (`updateStock`), `server/src/modules/products/product.service.js` (`updateStock`), `server/src/modules/products/product.model.js` (`adjustStock` static, `stockHistorySchema`), `server/src/config/constants.js` (`LIMITS.STOCK_HISTORY_KEEP`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
