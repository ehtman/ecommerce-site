# Review moderation list (admin) – `GET /api/admin/reviews`

An admin lists all reviews (visible and hidden) for moderation, newest first, paginated (default 20, max 100), filterable by rating, visibility and product, with the reviewer's email and the product name. Same handler as `GET /api/reviews/admin`, mounted here as an alias. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/reviews?rating=&visibility=&product=&page=&limit="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| V1["validate(adminListRules)<br/>review.validation.js"]
    V1 --> V2{"adminListRules pass?<br/>rating: optional int 1 to 5<br/>visibility: optional, visible or hidden<br/>product: optional MongoId"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["reviews.adminList<br/>review.controller.js<br/>re-exported by admin.routes.js"]
    CT --> S1["reviewService.adminList(req.query)<br/>review.service.js"]
    S1 --> S2["getPagination(query, REVIEW.ADMIN_PAGE_SIZE 20, ADMIN_MAX_PAGE_SIZE 100)"]
    S2 --> S3["whitelist filter<br/>rating, isVisible from visibility, product"]
    S3 --> S4[("Promise.all<br/>Review.find(filter).sort createdAt -1, _id -1<br/>.skip.limit.populate user name email<br/>.populate product name slug .lean()<br/>Review.countDocuments(filter)")]
    S4 --> S5["buildMeta(page, limit, total)"]
    S5 --> OK["sendSuccess 200 Reviews fetched<br/>data + meta"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EV --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/reviews/review.validation.js` (`adminListRules`), `server/src/modules/reviews/review.controller.js` (`adminList`), `server/src/modules/reviews/review.service.js` (`adminList`), `server/src/utils/pagination.js` (`getPagination`, `buildMeta`), `server/src/config/constants.js` (`REVIEW`), `server/src/modules/reviews/review.model.js` (queried), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
