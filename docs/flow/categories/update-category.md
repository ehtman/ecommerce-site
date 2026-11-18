# Update category – `PUT /api/categories/:id`

Admin only: changes any subset of a category's fields (partial update), e.g. `{ "isActive": false }` to switch it off. Renaming also renames the slug; sending `parent` re-checks the two-level rule; `image: null` removes the picture.

```mermaid
flowchart TD
    A[Client] -->|PUT /api/categories/:id| B[Express app<br/>app.js]
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
    O2 -->|Yes| V1["validate(updateCategoryRules)<br/>category.validation.js"]
    V1 --> V2{"Rules pass?<br/>name optional 2-50, description max 300, parent MongoId,<br/>image object or null, isActive bool, sortOrder 0-1000"}
    V2 -->|No| E8[ApiError 400<br/>Validation failed + field errors]
    V2 -->|Yes| K["update<br/>category.controller.js (asyncHandler)"]
    K --> S1["categoryService.updateCategory(id, body)<br/>category.service.js"]
    S1 --> S2["Category.findById(id)"]
    S2 --> S3{Found?}
    S3 -->|No| E9[ApiError 404<br/>Category not found]
    S3 -->|Yes| N1{name sent?}
    N1 -->|Yes| N2["assertNameFree(name, id)<br/>Category.exists({ name, _id ne id }).collation(CASE_INSENSITIVE)"]
    N2 --> N3{Name taken?}
    N3 -->|Yes| E10[ApiError 409<br/>A category with this name already exists]
    N3 -->|No| AS
    N1 -->|No| AS["Object.assign(category, pick(body))<br/>name, description, image, isActive, sortOrder"]
    AS --> T1{parent sent?}
    T1 -->|No| IM
    T1 -->|Yes| T2["checkParent(body.parent, id)"]
    T2 --> T3{"parent empty or null?"}
    T3 -->|Yes| T9["category.parent = null<br/>top-level"]
    T3 -->|No| T4{"parent equals own id?"}
    T4 -->|Yes| E11[ApiError 400<br/>A category cannot be its own parent]
    T4 -->|No| T5["Category.findById(parent).lean()"]
    T5 --> T6{Parent found?}
    T6 -->|No| E12[ApiError 400<br/>Parent category not found]
    T6 -->|Yes| T7{"parent.parent set?"}
    T7 -->|Yes| E13[ApiError 400<br/>Only two category levels are allowed]
    T7 -->|No| T8{"Category.exists({ parent: id })?<br/>has sub-categories"}
    T8 -->|Yes| E14[ApiError 400<br/>has sub-categories, cannot become a sub-category]
    T8 -->|No| T10["category.parent = parentId"]
    T9 --> IM
    T10 --> IM{"body.image === null?"}
    IM -->|Yes| IM2["category.image = undefined<br/>remove picture"]
    IM -->|No| SV
    IM2 --> SV["category.save()"]
    SV --> H1{"isModified name?"}
    H1 -->|Yes| H2["pre validate hook setSlug<br/>uniqueSlug(Category, name, _id) in slugify.js"]
    H1 -->|No| H3
    H2 --> H3{Schema validation OK?}
    H3 -->|No| E15[Mongoose ValidationError<br/>400 Validation failed]
    H3 -->|Yes| H4[update document in categories collection]
    H4 --> H5{"Duplicate key 11000?<br/>name or slug index"}
    H5 -->|Yes| E16[409<br/>field already exists]
    H5 -->|No| OK["sendSuccess 200<br/>Category updated + category"]
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
    E13 --> EH
    E14 --> EH
    E15 --> EH
    E16 --> EH
    EH --> R
```

**Files involved:** `server/src/app.js` (mounts `/api/categories`), `server/src/modules/categories/category.routes.js` (`PUT /:id` with `adminOnly`, `validateObjectId`, `validate`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validateObjectId`, `validate`), `server/src/modules/categories/category.validation.js` (`updateCategoryRules`), `server/src/modules/categories/category.controller.js` (`update`), `server/src/modules/categories/category.service.js` (`updateCategory`, `assertNameFree`, `checkParent`, `pick`), `server/src/modules/categories/category.model.js` (schema, unique indexes, `setSlug` hook), `server/src/db/utils/slugify.js` (`uniqueSlug`), `server/src/db/schemas/image.schema.js` (image sub-document), `server/src/config/constants.js` (`ROLES`, `REGEX`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
