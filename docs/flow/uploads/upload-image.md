# Upload image – `POST /api/uploads/image`

Admin only: receives ONE image as `multipart/form-data` (form field `image`, JPG/PNG/WEBP, max 2 MB), streams it from memory to Cloudinary and returns `{ url, publicId }`, which the admin form then sends in a product or category body. Optional `?folder=products|categories` (default `products`).

```mermaid
flowchart TD
    A[Client] -->|"POST /api/uploads/image?folder=products (multipart, field image)"| B[Express app<br/>app.js]
    B --> C["Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter<br/>(json/urlencoded skip multipart bodies)"]
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
    P6 -->|Yes| V{"validate(uploadImageRules)<br/>upload.validation.js<br/>query folder missing or one of products, categories?<br/>(checked BEFORE reading the file)"}
    V -->|No| X7["ApiError 400<br/>Validation failed: Folder must be one of products, categories"]
    V -->|Yes| U["upload.single('image')<br/>upload.middleware.js (multer)<br/>memoryStorage, limits: 1 file, 2 MB, 5 fields"]
    U --> U1{"fileFilter<br/>mimetype is image/jpeg, image/png or image/webp?"}
    U1 -->|No| X8["ApiError 400<br/>Only JPG, PNG and WEBP images are allowed"]
    U1 -->|Yes| U2{"Multer limit broken?<br/>(file over 2 MB, too many files, wrong field name)"}
    U2 -->|Yes| X9["MulterError<br/>errorHandler turns it into 400:<br/>LIMIT_FILE_SIZE = Each image must be 2 MB or less, else multer's message"]
    U2 -->|No| F["uploadImage<br/>upload.controller.js (asyncHandler)"]
    F --> G{"req.file present?"}
    G -->|No| X10["ApiError 400<br/>Please choose an image (form field image)"]
    G -->|Yes| H["folder = IMAGE_FOLDERS[req.query.folder] or IMAGE_FOLDERS.products<br/>shopease/products or shopease/categories"]
    H --> I["uploadBuffer(req.file.buffer, folder)<br/>config/cloudinary.js"]
    I --> J{"cloudinaryClient.isConfigured()<br/>all three CLOUDINARY_* keys set?"}
    J -->|No| X11["ApiError 500<br/>Cloudinary is not configured"]
    J -->|Yes| K["cloudinaryClient.upload(buffer, folder)<br/>cloudinary.uploader.upload_stream wrapped in a Promise<br/>Cloudinary API"]
    K --> K1{Cloudinary upload ok?}
    K1 -->|No| X12["ApiError 502<br/>Image upload failed (generic message)"]
    K1 -->|Yes| L["return { url: secure_url, publicId: public_id }"]
    L --> S["sendSuccess 201<br/>Image uploaded + data: url, publicId"]
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
```

**Files involved:** `server/src/app.js` (mounts `/api/uploads`, global middleware), `server/src/modules/uploads/upload.routes.js` (`router.use(protect, authorize(ROLES.ADMIN))`, `POST /image` with `validate(uploadImageRules)` then `upload.single('image')`), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/uploads/upload.validation.js` (`uploadImageRules`), `server/src/middleware/upload.middleware.js` (multer: memory storage, limits, `fileFilter`), `server/src/config/constants.js` (`LIMITS.MAX_IMAGE_BYTES`, `IMAGE_MIME_TYPES`), `server/src/modules/uploads/upload.controller.js` (`uploadImage`), `server/src/config/cloudinary.js` (`IMAGE_FOLDERS`, `uploadBuffer`, `cloudinaryClient.isConfigured`, `cloudinaryClient.upload`), `server/src/utils/ApiError.js`, `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (`errorHandler`, `MulterError` branch).
