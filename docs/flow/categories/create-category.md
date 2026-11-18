# Create category – `POST /api/categories`

Admin only: creates a top-level category or a sub-category (when `parent` is sent). The slug is never taken from the body; the model builds a unique one from the name.

```mermaid
flowchart TD
    A[Client] -->|POST /api/categories| B[Express app<br/>app.js]
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
    Q2 -->|Yes| V1["validate(createCategoryRules)<br/>category.validation.js"]
    V1 --> V2{"Rules pass?<br/>name 2-50, description max 300, parent MongoId,<br/>image url Cloudinary + publicId, isActive bool, sortOrder 0-1000"}
    V2 -->|No| E7[ApiError 400<br/>Validation failed + field errors]
    V2 -->|Yes| K["create<br/>category.controller.js (asyncHandler)"]
    K --> S1["categoryService.createCategory(req.body)<br/>category.service.js"]
    S1 --> S2["assertNameFree(name)<br/>Category.exists({ name }).collation(CASE_INSENSITIVE)"]
    S2 --> S3{Name taken?}
    S3 -->|Yes| E8[ApiError 409<br/>A category with this name already exists]
    S3 -->|No| S4["checkParent(body.parent)"]
    S4 --> S5{parent sent?}
    S5 -->|No| S9["parent = null<br/>top-level"]
    S5 -->|Yes| S6["Category.findById(parent).lean()"]
    S6 --> S7{Parent found?}
    S7 -->|No| E9[ApiError 400<br/>Parent category not found]
    S7 -->|Yes| S8{"parent.parent set?"}
    S8 -->|Yes| E10[ApiError 400<br/>Only two category levels are allowed]
    S8 -->|No| S10["parent = parentId"]
    S9 --> M1
    S10 --> M1["Category.create({ ...pick(body), parent })<br/>pick = name, description, image, isActive, sortOrder"]
    M1 --> M2["pre validate hook setSlug<br/>category.model.js"]
    M2 --> M3["uniqueSlug(Category, name)<br/>db/utils/slugify.js: Model.exists loop, slug, slug-2 ..."]
    M3 --> M4{Schema validation OK?}
    M4 -->|No| E11[Mongoose ValidationError<br/>400 Validation failed]
    M4 -->|Yes| M5[insert into categories collection]
    M5 --> M6{"Duplicate key 11000?<br/>name or slug index"}
    M6 -->|Yes| E12[409<br/>field already exists]
    M6 -->|No| OK["sendSuccess 201<br/>Category created + category"]
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
    E10 --> EH
    E11 --> EH
    E12 --> EH
    EH --> R
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`), `server/src/modules/categories/category.routes.js` (`POST /` with `adminOnly` + `validate`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/categories/category.validation.js` (`createCategoryRules`), `server/src/modules/categories/category.controller.js` (`create`), `server/src/modules/categories/category.service.js` (`createCategory`, `assertNameFree`, `checkParent`, `pick`), `server/src/modules/categories/category.model.js` (schema, unique indexes, `setSlug` hook), `server/src/db/utils/slugify.js` (`uniqueSlug`, `slugify`), `server/src/db/schemas/image.schema.js` (image sub-document), `server/src/config/constants.js` (`ROLES`, `REGEX`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
