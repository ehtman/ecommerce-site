# 17 – File uploads, multipart and a CDN (Cloudinary)

Products need pictures. Branch 04 lets an admin upload an image, stores it on **Cloudinary**, and saves only its address in MongoDB. This doc explains the pieces.

## 1. Where do images live? Not in the database, not on our server

| Option                                                   | Problem                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In MongoDB (as bytes)                                    | Documents get huge (16 MB limit), every product query drags images along, backups explode                                                               |
| On our server's disk (`/uploads`)                        | Serverless hosts (Vercel) have **no permanent disk**; several servers wouldn't share files; our API would serve big files instead of answering requests |
| **A storage/CDN service** (Cloudinary, S3 + CloudFront…) | ✅ built for files: cheap, fast worldwide, can resize/compress                                                                                          |

We store only two strings per image:

```json
{
  "url": "https://res.cloudinary.com/demo/image/upload/shopease/products/abc123.jpg",
  "publicId": "shopease/products/abc123"
}
```

- `url` – what the browser loads (must be on `https://res.cloudinary.com/`, `REGEX.CLOUDINARY_URL`).
- `publicId` – the file's name inside Cloudinary. We need it to **delete** the file later.

## 2. What is a CDN?

A **Content Delivery Network** keeps copies of each file on servers around the world ("edge" servers). A shopper in Karachi downloads the picture from a nearby edge server instead of from a data centre on another continent. Pages load faster, and our API never spends time sending image bytes. Cloudinary is an image service with a CDN built in. It can also resize on the fly (e.g. `/w_400/` in the URL gives a 400 px wide version).

## 3. Multipart: how a file travels over HTTP

JSON can only carry text. Browsers send files with the content type **`multipart/form-data`**: the body is cut into _parts_, one per form field, and a part can hold raw bytes:

```
POST /api/uploads/image?folder=products
Content-Type: multipart/form-data; boundary=----X

------X
Content-Disposition: form-data; name="image"; filename="shirt.png"
Content-Type: image/png

<binary bytes…>
------X--
```

`express.json()` ignores this kind of body, so we use **multer**, the standard Express multipart parser (`src/middleware/upload.middleware.js`):

| Setting           | Value                                    | Why                                                                             |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `storage`         | `memoryStorage()`                        | keep the bytes in RAM (`req.file.buffer`) and stream them on; no disk needed    |
| `limits.fileSize` | 2 MB (`LIMITS.MAX_IMAGE_BYTES`)          | multer stops reading as soon as a file is bigger, so nobody can fill our memory |
| `limits.files`    | 1                                        | one picture per request                                                         |
| `fileFilter`      | JPG, PNG, WEBP only (`IMAGE_MIME_TYPES`) | no PDFs, no GIFs, and **no SVG** (an SVG is XML and can contain scripts)        |

Errors become normal 400 responses: our filter throws an `ApiError(400)`, and multer's own errors (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`, `LIMIT_FILE_COUNT`) are mapped to 400 in `error.middleware.js`.

> **A MIME type is a claim, not a proof.** The `Content-Type` of a part is chosen by the client. Someone can label a `.exe` as `image/png`. Our 2 MB limit and admin-only access keep the risk small, and Cloudinary refuses files that aren't really images. A stricter server would also check the file's first bytes ("magic numbers", e.g. PNG files start with `89 50 4E 47`).

## 4. The two-step upload flow

```mermaid
sequenceDiagram
  actor A as Admin (browser)
  participant API
  participant C as Cloudinary
  participant DB as MongoDB
  A->>API: POST /uploads/image (multipart, field "image")
  API->>API: protect → authorize admin → validate ?folder → multer (type, size)
  API->>C: upload_stream(buffer, folder "shopease/products")
  C-->>API: { secure_url, public_id }
  API-->>A: 201 { url, publicId }
  A->>API: POST /products (JSON) images: [{ url, publicId }]
  API->>DB: save product
```

Why two steps? The product routes stay **plain JSON** (easy to validate and test), the admin sees a preview as soon as a picture is uploaded, and the same endpoint serves categories (`?folder=categories`).

**Orphans:** if the admin uploads a picture and then cancels the form, the file is never used. The frontend calls `DELETE /api/uploads/image { publicId }` for that. When a product is updated or deleted, the service deletes the images it no longer uses (`deleteImage()`, after the database write succeeded). `deleteImage` only touches files whose `publicId` starts with `shopease/`, and it **never throws**: a leftover file costs a few kilobytes, but failing the admin's request after the product was already saved would be worse.

## 5. Making an external service testable: the injectable client

Tests must not call Cloudinary: that would be slow, cost money, need secret keys and fail without internet. So every call goes through **one small object** (`src/config/cloudinary.js`):

```js
export const cloudinaryClient = {
  isConfigured() { … },          // are the CLOUDINARY_* keys set?
  upload(buffer, folder) { … },  // → Promise<{ secure_url, public_id }>
  destroy(publicId) { … },
};
```

Tests replace its methods with fakes ("stubs") and put the real ones back afterwards. It's the same pattern as `auth/google.verifier.js` from branch 01:

```js
cloudinaryClient.isConfigured = () => true;
cloudinaryClient.upload = async (buffer, folder) => ({
  secure_url: `https://res.cloudinary.com/demo/${folder}/fake.jpg`,
  public_id: `${folder}/fake`,
});
```

The fakes also **record** what they received, so a test can check "the exact bytes were sent to the products folder" or "the removed image was deleted".

## 6. Configuration and failure modes

| Situation                                                  | Upload answer                                                                               | Delete behaviour               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `CLOUDINARY_*` empty (default)                             | **500** "Cloudinary is not configured"                                                      | skipped (`deleted: false`)     |
| Cloudinary refuses / is down                               | **502** "Image upload failed" (its own message isn't shown: it may contain account details) | logged, request still succeeds |
| Not an image, > 2 MB, two files, wrong field name, no file | **400**                                                                                     | –                              |
| Customer / no token                                        | **403** / **401**                                                                           | **403** / **401**              |

Set up a free account: Cloudinary → Dashboard → API Keys, then fill `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `server/.env`. The **secret** must never be committed or sent to the frontend.

> **Try it**
>
> 1. Without Cloudinary keys: in Swagger, `POST /uploads/image` with a PNG → 500 "not configured". With a PDF → 400.
> 2. With keys: upload a picture, open the returned `url` in the browser, then create a product with it.
> 3. Read `tests/integration/uploads.test.js`: find the test that proves a 2 MB + 1 byte file is refused.

## Check yourself

1. Why don't we store images in MongoDB or on the API server's disk?
2. What is `multipart/form-data`, and why can't `express.json()` read it?
3. Why do we refuse SVG files?
4. Why does `deleteImage` never throw, and why is it called _after_ the database write?
5. How do the tests upload "images" without a network connection?

## In this repo

- `server/src/config/cloudinary.js`, `server/src/middleware/upload.middleware.js`
- `server/src/modules/uploads/*`
- `server/src/db/schemas/image.schema.js` (from branch 03)
- `server/tests/integration/uploads.test.js`, `server/tests/unit/cloudinary.test.js`
