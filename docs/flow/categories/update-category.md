# Update category – `PUT /api/categories/:id`

Admin only: changes any subset of a category's fields (name, description, parent, image, isActive, sortOrder). Renaming rebuilds the slug. From branch 04, when the image is replaced or removed (`image: null`), the old file is deleted from Cloudinary after the save worked.

```mermaid
flowchart TD
    A[Client] -->|PUT /api/categories/:id| B[Express app<br/>app.js]
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
    VO -->|Yes| V{"validate(updateCategoryRules)<br/>category.validation.js<br/>optional name 2-50, description, parent id,<br/>image object with Cloudinary url + publicId or null,<br/>isActive, sortOrder 0-1000?"}
    V -->|No| X8["ApiError 400<br/>Validation failed + errors: field, message"]
    V -->|Yes| F["update<br/>category.controller.js (asyncHandler)"]
    F --> G["categoryService.updateCategory(req.params.id, req.body)<br/>category.service.js"]
    G --> H{"Category.findById(id) found?"}
    H -->|No| X9["ApiError 404<br/>Category not found"]
    H -->|Yes| I["oldImage = category.image.publicId<br/>(remembered for Cloudinary cleanup)"]
    I --> J{"body.name sent?"}
    J -->|Yes| J2{"assertNameFree(name, id)<br/>Category.exists({ name, _id: { $ne: id } })<br/>.collation(CASE_INSENSITIVE)?"}
    J2 -->|Yes| X10["ApiError 409<br/>A category with this name already exists (field: name)"]
    J2 -->|No| K
    J -->|No| K["Object.assign(category, pick(body))<br/>FIELDS whitelist: name, description, image, isActive, sortOrder"]
    K --> L{"body.parent sent?"}
    L -->|No| N
    L -->|Yes| CP{"checkParent(parent, id)<br/>parent empty?"}
    CP -->|Yes| CP0["category.parent = null (top-level)"]
    CP0 --> N
    CP -->|No| CP1{"parent equals own id?"}
    CP1 -->|Yes| X11["ApiError 400<br/>A category cannot be its own parent"]
    CP1 -->|No| CP2{"Category.findById(parentId).lean() found?"}
    CP2 -->|No| X12["ApiError 400<br/>Parent category not found"]
    CP2 -->|Yes| CP3{"parent has its own parent?"}
    CP3 -->|Yes| X13["ApiError 400<br/>Only two category levels are allowed"]
    CP3 -->|No| CP4{"Category.exists({ parent: id })?<br/>(this category has children)"}
    CP4 -->|Yes| X14["ApiError 400<br/>This category has sub-categories, so it cannot become a sub-category"]
    CP4 -->|No| CP5["category.parent = parentId"]
    CP5 --> N
    N{"body.image is null?"}
    N -->|Yes| N1["category.image = undefined (remove picture)"]
    N1 --> O
    N -->|No| O["category.save()<br/>pre('validate') setSlug hook in category.model.js:<br/>uniqueSlug only if name changed<br/>runs every schema validator"]
    O --> O1{Schema validators pass?}
    O1 -->|No| X15["Mongoose ValidationError<br/>errorHandler turns it into 400 Validation failed"]
    O1 -->|Yes| O2{"Unique index conflict?<br/>(name or slug, error 11000)"}
    O2 -->|Yes| X16["E11000 duplicate key<br/>errorHandler turns it into 409 field already exists"]
    O2 -->|No| Q{"oldImage set and different from<br/>category.image.publicId now?"}
    Q -->|No| S
    Q -->|Yes| DI{"deleteImage(oldImage)<br/>config/cloudinary.js<br/>Cloudinary configured and publicId starts with shopease/?"}
    DI -->|No| DI1["skip, returns false"]
    DI -->|Yes| DI2["cloudinaryClient.destroy(oldImage)<br/>Cloudinary API<br/>on failure: console.error, returns false (never throws)"]
    DI1 --> S
    DI2 --> S
    S["sendSuccess 200<br/>Category updated + category"]
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
    X14 --> EH
    X15 --> EH
    X16 --> EH
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`, global middleware), `server/src/modules/categories/category.routes.js` (`PUT /:id` with `protect`, `authorize(ROLES.ADMIN)`, `validateObjectId('id')`, `validate(updateCategoryRules)`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/categories/category.validation.js` (`updateCategoryRules`), `server/src/modules/categories/category.controller.js` (`update`), `server/src/modules/categories/category.service.js` (`updateCategory`, `assertNameFree`, `checkParent`, `pick`), `server/src/modules/categories/category.model.js` (`setSlug` hook, `CASE_INSENSITIVE` collation, unique indexes), `server/src/db/utils/slugify.js` (`uniqueSlug`), `server/src/config/cloudinary.js` (`deleteImage`, `cloudinaryClient.destroy`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
