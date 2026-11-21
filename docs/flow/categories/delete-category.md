# Delete category – `DELETE /api/categories/:id`

Admin only: permanently deletes a category. Refused while any product still uses it (branch 04) or while it has sub-categories. After the delete, its picture is removed from Cloudinary (branch 04).

```mermaid
flowchart TD
    A[Client] -->|DELETE /api/categories/:id| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D[categoryRoutes<br/>category.routes.js]
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
    VO -->|Yes| F["remove<br/>category.controller.js (asyncHandler)"]
    F --> G["categoryService.deleteCategory(req.params.id)<br/>category.service.js"]
    G --> H{"Category.findById(id) found?"}
    H -->|No| X8["ApiError 404<br/>Category not found"]
    H -->|Yes| I{"Product.countDocuments({ category: id })<br/>above 0?"}
    I -->|Yes| X9["ApiError 400<br/>Cannot delete: N product(s) use this category. Deactivate it instead."]
    I -->|No| J{"Category.countDocuments({ parent: id })<br/>above 0?"}
    J -->|Yes| X10["ApiError 400<br/>Cannot delete: it has N sub-category / sub-categories"]
    J -->|No| K["category.deleteOne()<br/>MongoDB delete"]
    K --> L{"category.image.publicId set?"}
    L -->|No| S
    L -->|Yes| DI{"deleteImage(publicId)<br/>config/cloudinary.js<br/>Cloudinary configured and publicId starts with shopease/?"}
    DI -->|No| DI1["skip, returns false"]
    DI -->|Yes| DI2["cloudinaryClient.destroy(publicId)<br/>Cloudinary API<br/>on failure: console.error, returns false (never throws)"]
    DI1 --> S
    DI2 --> S
    S["sendSuccess 200<br/>Category deleted (data null)"]
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
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`, global middleware), `server/src/modules/categories/category.routes.js` (`DELETE /:id` with `protect`, `authorize(ROLES.ADMIN)`, `validateObjectId('id')`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`), `server/src/modules/categories/category.controller.js` (`remove`), `server/src/modules/categories/category.service.js` (`deleteCategory`: product check, sub-category check, image cleanup), `server/src/modules/products/product.model.js` (`Product.countDocuments`), `server/src/config/cloudinary.js` (`deleteImage`, `cloudinaryClient.destroy`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
