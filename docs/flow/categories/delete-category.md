# Delete category – `DELETE /api/categories/:id`

Admin only: permanently deletes a category. It is refused while the category still has sub-categories (they would be left pointing at nothing).

```mermaid
flowchart TD
    A[Client] -->|DELETE /api/categories/:id| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[categoryRoutes<br/>category.routes.js]
    D --> P1["protect<br/>auth.middleware.js"]
    P1 --> P2{"Bearer token in header?"}
    P2 -->|No| E1[ApiError 401<br/>token missing]
    P2 -->|Yes| P3{"jwt.verify OK?"}
    P3 -->|No| E2[ApiError 401<br/>token invalid or expired]
    P3 -->|Yes| P4["User.findById(payload.id)"]
    P4 --> P5{User exists?}
    P5 -->|No| E3[ApiError 401<br/>user no longer exists]
    P5 -->|Yes| P6{user.isActive?}
    P6 -->|No| E4[ApiError 403<br/>Account disabled]
    P6 -->|Yes| P7{"user.isTokenOutdated(payload.v)?"}
    P7 -->|Yes| E5[ApiError 401<br/>Password was changed, log in again]
    P7 -->|No| Q1["authorize(ROLES.ADMIN)<br/>auth.middleware.js"]
    Q1 --> Q2{"role is admin?"}
    Q2 -->|No| E6[ApiError 403<br/>Access denied]
    Q2 -->|Yes| O1["validateObjectId('id')<br/>validate.middleware.js"]
    O1 --> O2{"isObjectIdOrHexString(id)?"}
    O2 -->|No| E7[ApiError 400<br/>Invalid id]
    O2 -->|Yes| K["remove<br/>category.controller.js (asyncHandler)"]
    K --> S1["categoryService.deleteCategory(id)<br/>category.service.js"]
    S1 --> S2["Category.findById(id)"]
    S2 --> S3{Found?}
    S3 -->|No| E8[ApiError 404<br/>Category not found]
    S3 -->|Yes| S4["Category.countDocuments({ parent: id })"]
    S4 --> S5{"children greater than 0?"}
    S5 -->|Yes| E9["ApiError 400<br/>Cannot delete: it has N sub-categories"]
    S5 -->|No| S6["category.deleteOne()"]
    S6 --> OK["sendSuccess 200<br/>Category deleted"]
    OK --> R[Client]
    E1 --> EH[errorHandler<br/>error.middleware.js]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    E7 --> EH
    E8 --> EH
    E9 --> EH
    EH --> R
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`), `server/src/modules/categories/category.routes.js` (`DELETE /:id` with `adminOnly`, `validateObjectId`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/categories/category.controller.js` (`remove`), `server/src/modules/categories/category.service.js` (`deleteCategory`), `server/src/modules/categories/category.model.js` (Category model, `parent` index), `server/src/config/constants.js` (`ROLES`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
