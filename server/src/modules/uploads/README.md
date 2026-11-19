# src/modules/uploads/: admin image uploads (Cloudinary)

Mounted at **`/api/uploads`**. Every route needs `protect` + `authorize('admin')`. Step 1 of the two-step image flow: upload here and get `{ url, publicId }`, then send that inside the product (or category) JSON.

| File                   | What it does                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload.validation.js` | `uploadImageRules` (`?folder=products\|categories`), `deleteImageRules` (`publicId` must start with `shopease/`).                                                                 |
| `upload.controller.js` | `uploadImage` (400 without a file, then `uploadBuffer` → 201) and `deleteUploadedImage` (`deleteImage` → `{ deleted }`). No service file: `config/cloudinary.js` plays that role. |
| `upload.routes.js`     | `POST /image`: validate → `upload.single('image')` (multer) → controller. `DELETE /image`.                                                                                        |
| `upload.docs.js`       | OpenAPI for `/uploads/image` (tag **Uploads**, multipart file picker in Swagger UI).                                                                                              |

Uses `config/cloudinary.js` (the stubbable `cloudinaryClient`) and `middleware/upload.middleware.js` (multer: 1 file, 2 MB, JPG/PNG/WEBP).

Concept: [17 – File uploads and a CDN](../../../../docs/concepts/17-file-uploads-and-cdn.md) · Tests: `tests/integration/uploads.test.js`, `tests/unit/cloudinary.test.js`
