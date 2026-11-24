# Admin list reviews – `GET /api/reviews/admin`

Admin-only moderation list of EVERY review (visible and hidden), newest first, paginated (default 20, max 100), with optional filters `?rating=`, `?visibility=visible|hidden` and `?product=`. Reviewer name and email and the product name and slug are populated.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/reviews/admin?rating=&visibility=&product=&page=&limit="| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["review.routes.js<br/>router.use protect, then GET /admin<br/>declared before /:id routes"]
    RT --> P1{"protect: Bearer token in header?<br/>auth.middleware.js"}
    P1 -->|No| EP1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify token, JWT_SECRET OK?"}
    P2 -->|No| EP2["ApiError 401<br/>token invalid or expired"]
    P2 -->|Yes| P3["User.findById payload.id"]
    P3 --> P4{"User found?"}
    P4 -->|No| EP3["ApiError 401<br/>user no longer exists"]
    P4 -->|Yes| P5{"user.isActive?"}
    P5 -->|No| EP4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated payload.v?"}
    P6 -->|Yes| EP5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| AZ{"authorize ROLES.ADMIN<br/>req.user.role is admin?"}
    AZ -->|No| EP6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| V{"validate adminListRules<br/>rating optional int 1-5, visibility optional visible or hidden,<br/>product optional MongoId"}
    V -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["review.controller.js adminList<br/>req.query"]
    CT --> S1["reviewService.adminList<br/>getPagination REVIEW.ADMIN_PAGE_SIZE 20, ADMIN_MAX_PAGE_SIZE 100"]
    S1 --> S2["Whitelist filter<br/>rating, isVisible = visibility is visible, product<br/>only when sent"]
    S2 --> S3["Promise.all<br/>Review.find filter .sort createdAt -1, _id -1 .skip .limit<br/>.populate user name email .populate product name slug .lean<br/>Review.countDocuments filter"]
    S3 --> S4["buildMeta page, limit, total"]
    S4 --> S["sendSuccess 200 Reviews fetched<br/>data = reviews, meta = pagination"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EV --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/reviews, apiLimiter), `server/src/modules/reviews/review.routes.js` (router.use protect, GET /admin), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validate), `server/src/modules/reviews/review.validation.js` (adminListRules), `server/src/modules/reviews/review.controller.js` (adminList), `server/src/modules/reviews/review.service.js` (adminList), `server/src/modules/reviews/review.model.js` (Review, index isVisible + rating + createdAt), `server/src/utils/pagination.js` (getPagination, buildMeta), `server/src/config/constants.js` (REVIEW, ROLES), `server/src/middleware/error.middleware.js` (errorHandler)
