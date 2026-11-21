# Delete uploaded image – `DELETE /api/uploads/image`

Admin only: deletes a freshly uploaded picture from Cloudinary (e.g. the admin removes it from the form before saving), so unused files do not stay on Cloudinary forever. Only our own files (`publicId` starting with `shopease/`) can be deleted. Answers `{ deleted }`: false when Cloudinary is not configured or the delete failed.

```mermaid
flowchart TD
    A[Client] -->|"DELETE /api/uploads/image (JSON body: publicId)"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["uploadRoutes<br/>upload.routes.js<br/>router.use(protect, authorize('admin'))"]
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
    P6 -->|Yes| V{"validate(deleteImageRules)<br/>upload.validation.js<br/>publicId is a string matching shopease/ + 1-200 word chars, / or -?"}
    V -->|No| X7["ApiError 400<br/>Validation failed: publicId is required / must be one of our images"]
    V -->|Yes| F["deleteUploadedImage<br/>upload.controller.js (asyncHandler)"]
    F --> DI{"deleteImage(req.body.publicId)<br/>config/cloudinary.js<br/>Cloudinary configured and publicId starts with shopease/?"}
    DI -->|No| DI1["deleted = false (skipped)"]
    DI -->|Yes| DI2["cloudinaryClient.destroy(publicId)<br/>cloudinary.uploader.destroy<br/>Cloudinary API"]
    DI2 --> DI3{Cloudinary delete ok?}
    DI3 -->|Yes| DI4["deleted = true"]
    DI3 -->|No| DI5["console.error (not in tests)<br/>deleted = false (never throws)"]
    DI1 --> S
    DI4 --> S
    DI5 --> S
    S["sendSuccess 200<br/>Image deleted + data: deleted"]
    S --> R[Client]
    X1 --> EH["errorHandler<br/>error.middleware.js"]
    X2 --> EH
    X3 --> EH
    X4 --> EH
    X5 --> EH
    X6 --> EH
    X7 --> EH
```

**Files involved:** `server/src/app.js` (mounts `/api/uploads`, global middleware), `server/src/modules/uploads/upload.routes.js` (`router.use(protect, authorize(ROLES.ADMIN))`, `DELETE /image` with `validate(deleteImageRules)`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/uploads/upload.validation.js` (`deleteImageRules`), `server/src/modules/uploads/upload.controller.js` (`deleteUploadedImage`), `server/src/config/cloudinary.js` (`deleteImage`, `cloudinaryClient.isConfigured`, `cloudinaryClient.destroy`), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`).
