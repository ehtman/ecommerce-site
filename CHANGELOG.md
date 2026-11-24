# Changelog

One entry per branch. Each entry says what the branch added or changed compared with the step before.

---

## 10 – admin (`10-admin`)

Ported from the reference app's `admin` module (+ the admin parts of users, and a full store seed), adapted to this repo's conventions. Final backend branch.

### Added
- `GET /api/admin/dashboard/stats?range=7d|30d|12m&tz=` – revenue (delivered), orders by status, customers, products, low stock, revenue chart, top products, recent orders.
- `GET /api/admin/reports/sales?from&to&groupBy=day|week|month&tz=` – sales per period, per category, top products (one `$match` + `$facet`).
- `GET /api/admin/reports/sales/export` – the sales report as a CSV download; `GET /api/admin/reports/orders/export?from&to&status&tz=` – every order as a **streamed** CSV (cursor + async generator, backpressure).
- `GET /api/admin/inventory` – totals, stock value and per-category table; `GET /api/admin/products/low-stock?threshold=` (the only low-stock route).
- `GET /api/admin/users` (search, status, pagination, order count, money spent), `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id/status` (not yourself, not an admin; deactivated tokens get 403 at once).
- The other modules' admin handlers under `/api/admin` (thin re-exports, the reference client's URLs): `GET /admin/categories` (with `productCount`), `GET /admin/products`, `GET /admin/products/:id`, `GET /admin/orders`, `PATCH /admin/orders/:id/status` (moved here from the orders module, same URL), `GET /admin/reviews`, `PATCH /admin/reviews/:id/visibility`, `GET/POST /admin/coupons`, `PUT/DELETE /admin/coupons/:id`.
- `src/utils/dates.js` (time-zone-aware calendar days via `Intl`) and `src/utils/csv.js` (RFC 4180 + formula-injection guard); constants `ADMIN_REPORTS`, `PAGINATION`.
- `npm run seed` – idempotent full store seed: admin, 14 categories, 30 products (Cloudinary demo images), coupons WELCOME10 and FLAT500. Docs now start with `npm run seed` (`seed:admin` still creates only the admin).
- Tests: 108 new (1128 in total): `admin.test.js` (exact numbers on known data, UTC vs Asia/Karachi, CSV content, guards), `admin-aliases.test.js`, `reporting.test.js`, `seed.test.js` (seed twice = same counts).
- Postman and Bruno folder **10 Admin** (needs `npm run seed`); OpenAPI tag **Admin**.
- Docs: module guide 10, mind map 10, concept [24 – Reporting: aggregation pipelines, time zones, CSV, admin lists and seeding](docs/concepts/24-reporting-aggregation-and-csv.md).

### Changed (compared with the reference)
- Strict 400s for unknown `range`/`groupBy`/`limit`/`page`/`threshold`; optional `tz` (default `UTC` = reference numbers); `isActive` must be a real JSON boolean.
- Sales report: one `$facet` instead of three queries; sales of deleted products kept as "Uncategorised".
- Customer management lives in the admin module (same URLs and shapes); `GET /admin/users/:id` returns 404 for admins and adds `summary { orderCount, totalSpent }`.
- Low stock is served by the admin module (adds `slug`, `price`, category name and `?threshold`); coupon CRUD and review moderation also stay on `/api/coupons` and `/api/reviews/admin`.
- Seed: exported `seedStore()`, "exists → skip, else create" for every record; refuses to promote a customer whose email equals `ADMIN_EMAIL`.
- New endpoints: the two CSV exports and `/admin/inventory`.

---

## 09 – reviews (`09-reviews`)

Ported from the reference app's `reviews` module, adapted to this repo's conventions.

### Added
- Reviews module: `GET /api/products/:id/reviews` (public, paginated, visible only), `GET /api/products/:id/reviews/eligibility`, `POST /api/products/:id/reviews` (customer with a DELIVERED order containing the product, one review per product), `PUT /api/reviews/:id` (author), `DELETE /api/reviews/:id` (author or admin), moderation `GET /api/reviews/admin` and `PATCH /api/reviews/:id/visibility` (admin).
- Review model with the compound unique index `{ product, user }` and an aggregation pipeline that recalculates the denormalized `Product.ratingAverage` / `ratingCount` after every create, edit, hide/show and delete (Mongoose post hooks). Hidden reviews don't count.
- `REVIEW` constants (rating range, title/comment lengths, page sizes).
- OpenAPI tag **Reviews**; Postman + Bruno folder **09 Reviews** (self-contained: catalogue → customer → COD order → delivered via `PATCH /api/admin/orders/:id/status` → review → moderation); `createReview` factory.
- Tests: 96 new (1020 in total), incl. a parallel duplicate-review race (`[201, 409]`) and exact rating recalculation.
- Docs: module guide 09, mind map 09, concept [23 – Ratings: aggregation pipelines, denormalized counters, compound unique indexes, moderation](docs/concepts/23-ratings-aggregation-moderation.md).

### Changed
- `DELETE /api/products/:id` (hard delete) also deletes the product's reviews (as in the reference).

### Changed (compared with the reference)
- Moderation routes under `/api/reviews` (the admin aliases `/api/admin/reviews` arrive with branch 10).
- List and eligibility answer 404 for a product id that doesn't exist; a duplicate-key race (E11000) gets the same 409; `PUT` with an empty `title` removes it; the admin list validates its filters (400).

---

## 08 – payments (`08-payments`)

Ported from the reference app's `payments` module, adapted to this repo's conventions.

### Added
- Card payments with **Stripe Checkout** (hosted payment page; card data never reaches the API), behind the feature flag `PAYMENT_CARD_ENABLED`.
- `POST /api/payments/checkout-session`: verified customer, own unpaid CARD order only, amount always taken from the database, 30-minute payment window, 502 when Stripe is unreachable.
- `POST /api/payments/webhook`: raw body (registered before `express.json()`), Stripe **signature** verification, handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`, **idempotent** (state check + atomic conditional update; repeated or simultaneous deliveries → one change, one email), amount/currency check. The only code path that marks a card order paid.
- `GET|POST /api/payments/expire-unpaid`: cron job protected by `CRON_SECRET` (`x-cron-secret` or `Authorization: Bearer`; 401 missing, 403 wrong, constant-time compare) that cancels CARD orders unpaid after 30 minutes and restores stock and coupon use (`cancelWithRestore` with a `filter`, so a just-paid order is never cancelled). Scheduled daily by Vercel Cron (`vercel.json`).
- `/api/health` reports `cardPaymentsEnabled`. CARD orders are refused while cards are off and get their confirmation email from the webhook.
- Stripe wrapped in `stripe.gateway.js` (injectable, no network in tests); webhooks tested with real signatures via `Stripe.webhooks.generateTestHeaderString`.
- New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET` (`PAYMENT_CARD_ENABLED` came with 07). New dependency: `stripe`. Constant `PAYMENTS`.
- Tests: 57 new (924 in total). Postman/Bruno folder **08 Payments** (no Stripe account needed; needs `CRON_SECRET=test-cron-secret`).
- Docs: module guide 08 (incl. Stripe CLI `stripe listen` + test card 4242…), mind map 08, concept [22 – Webhooks, signatures and idempotency](docs/concepts/22-webhooks-signatures-idempotency.md), Vercel deployment guide (env vars, cron, webhook).

### Changed (compared with the reference)
- Stripe client behind `stripe.gateway.js` (lazy); the webhook needs only `STRIPE_WEBHOOK_SECRET` (not the card flag), so payments already made are never lost.
- Atomic claim (`findOneAndUpdate({ paymentStatus: 'pending' })`), amount/currency verification, `client_reference_id`, validated metadata id; webhook answers with the `sendSuccess` envelope.
- Cron auth 401 missing / 403 wrong with `timingSafeEqual`; the job continues after one failing order and counts `skipped`. Checkout refuses orders older than the 30-minute window; Stripe errors → 502.

---

## 07 – orders (`07-orders`)

Ported from the reference app's `orders` module, adapted to this repo's conventions.

### Added
- Orders module: `POST /api/orders` (verified customers), `GET /api/orders/my`, `GET /api/orders/:id` (owner or admin), `PATCH /api/orders/:id/cancel`, `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`.
- Checkout in ONE MongoDB transaction: atomic stock reservation (`stock >= qty`), coupon re-checked and consumed atomically, item/address/coupon snapshots, server-calculated totals (`calcTotals`), cart emptied; any failure rolls everything back.
- Order status state machine (BR-08) with history; customer cancel while pending/confirmed (BR-06) restores stock and coupon use; COD becomes paid on delivery; tracking number required to ship.
- Order confirmation and status emails (every user-typed value escaped). `Address.toSnapshot()`. New env var `PAYMENT_CARD_ENABLED` (default `false`; card checkout arrives in branch 08).
- Tests: 155 new (867 in total): state machine unit tests, every route, concurrency (last unit, coupon limit, double click, double cancel) and forced-rollback tests; factories `createOrder(user, overrides)` and `deliverOrder(order)`. Postman/Bruno folder `07 Orders`.
- Docs: module guide, mind map, concepts [20 – Transactions, ACID and race conditions](docs/concepts/20-transactions-and-race-conditions.md) and [21 – State machines and snapshots](docs/concepts/21-state-machines-and-snapshots.md).

### Changed
- `DELETE /api/products/:id` only hides (`isActive: false`, `softDeleted: true`) a product that an order contains (BR-10).
- `DELETE /api/coupons/:id` deactivates a coupon that any order references, even when a cancellation gave its use back.

### Changed (compared with the reference)
- Admin order routes live in the orders module (`adminOrderRoutes`, mounted at `/api/admin/orders`) until the admin module (branch 10).
- `changeStatus` throws `ApiError(400)`; explicit max-quantity check at checkout (409 problem line); `listRules` reject unknown `status`/`paymentStatus` and non-date `from`/`to`; lists sort by `createdAt` then `_id`.
- `PageMeta` stays the one shared schema from `docs/openapi.js`.

---

## 06 – coupons (`06-coupons`)

Ported from the reference app's `coupons` module, adapted to this repo's conventions.

### Added
- Coupons module (`/api/coupons`): admins create, list, view, replace and delete discount codes
  (percentage 1–90% with optional cap, or fixed Rs 1–100,000; minimum order; validity window;
  optional usage limit). Used coupons are deactivated instead of deleted.
- Customers preview a code on their cart (`POST /api/coupons/validate`): server-side subtotal,
  whole-rupee discount (rounded down, capped, never above the subtotal) and new totals.
- Atomic `Coupon.consume` / `Coupon.release` usage counter, ready for checkout (branch 07).
- `calcTotals` pricing helper; `COUPON_TYPES`, `REGEX.COUPON_CODE`, `LIMITS.COUPON_MAX_*` constants.
- Tests: 102 new (712 in total): coupon unit suite (discount edge cases, validity window, limits) and integration suite
  for every route, including duplicate-code and usage-counter races. Postman/Bruno folder `06 Coupons`.
- Docs: module guide, mind map, concept 19 (money math, validity windows, atomic counters).

### Changed (compared with the reference)
- Admin CRUD at `/api/coupons` (+ `GET /api/coupons/:id`) instead of `/api/admin/coupons`; explicit 409 `Coupon code already exists`; limits as constants; per-type value range and date order checked in validation; the preview refuses a cart whose subtotal is 0.
- `calcTotals` lives once in `utils/pricing.js` (branch 05 had added the same helper; the coupon branch's documented copy was kept).
- `deleteCoupon` does not check orders yet (branch 07, marked `// Branch 07:`).

---

## 05 – cart & wishlist (`05-cart-wishlist`)

Ported from the reference app's `cart` and `wishlist` modules (+ `utils/pricing.js`), adapted to this repo's conventions.

### Added
- Cart module (`/api/cart`): get cart with live prices, add item (quantities add up), set quantity,
  remove item, clear. Customers only. Totals, Rs 250 shipping and free shipping from Rs 5,000 are
  calculated on the server; the cart stores no prices and ignores any price sent by the client.
- BR-04: max 10 per product and never more than the stock (also for the running total).
- Lines whose product became inactive / sold out / short of stock are kept, flagged with `issue`,
  excluded from totals and reported with `hasIssues`.
- Wishlist module (`/api/wishlist`): get, idempotent add (`$addToSet`), idempotent remove, max 100
  enforced atomically, inactive products hidden.
- `src/utils/pricing.js` (`calcShipping`, `calcTotals`), `LIMITS.MAX_CART_QTY`, `LIMITS.MAX_WISHLIST`, `PRICING`.
- OpenAPI tags Cart and Wishlist; Postman + Bruno folder "05 Cart & Wishlist".
- Docs: module 05 guide, mind map, concept 18 (transactions, atomic updates, upserts, idempotency,
  embedded sub-documents, server-side prices).

### Changed
- Registration and Google sign-up now create the user, an empty cart and an empty wishlist in ONE
  MongoDB transaction (`createUserWithCartAndWishlist` in `auth.service.js`) Google sign-up still
  stores the Google photo as `avatar` (branch 04).
- Deleting a product (`DELETE /api/products/:id`) now also removes it from every cart and wishlist
  (`updateMany` + `$pull`, as in the reference).
- Tests: 97 new (610 in total), incl. `product-delete-cart.test.js`.

---

## 04 – products & uploads (`04-products-uploads`)

Ported from the reference app's `products` and `uploads` modules (+ `config/cloudinary.js`, `middleware/upload.middleware.js`, `utils/pagination.js`), adapted to this repo's conventions.

### Added
- **Products module** (`/api/products`). Public: list with **pagination** (`page`, `limit` ≤ 48, `meta`), **filters** (category slug incl. sub-categories, price range, rating, in stock, featured, brand), **keyword search** (weighted text index) and **sorting** (`newest`, `price_asc`, `price_desc`, `rating`, `popular`, each with an `_id` tie-breaker); `GET /brands`; `GET /:slug`. Only **active** products are ever public (inactive = 404). Admin: create, replace, delete, remove one image, and `PATCH /:id/stock` (`adjust`/`set` with a reason, recorded in a 50-entry stock history).
- **Product model:** unique slug (auto `-2`) and upper-case SKU, whole-rupee prices, `compareAtPrice > price`, 1–5 Cloudinary images, specifications, virtuals `inStock`/`discountPercent`, one compound index per listing, and atomic, oversell-safe `reserveStock`/`releaseStock`/`adjustStock`.
- **Uploads module** (`/api/uploads`, admin): `POST /image` (multipart field `image`, JPG/PNG/WEBP ≤ 2 MB, `?folder=products|categories`) → `{ url, publicId }` on Cloudinary; `DELETE /image` for unused uploads (`shopease/…` only).
- **Cloudinary behind a stubbable `cloudinaryClient`** (like `googleVerifier`): tests never touch the network. Missing keys → 500 "not configured"; Cloudinary failure → 502; deletes never fail a request.
- **Categories:** a category used by products can't be deleted (400); replaced/removed category images are deleted from Cloudinary; `listAllWithCounts()` for the admin.
- **User `avatar`** (`{ url, publicId }`), filled from the Google photo on first Google sign-in.
- **Constants / helpers:** `REGEX.SKU`, `LIMITS.MAX_PRODUCT_IMAGES/MAX_SPECIFICATIONS/STOCK_HISTORY_KEEP/LOW_STOCK_THRESHOLD/MAX_IMAGE_BYTES`, `IMAGE_MIME_TYPES`, `utils/pagination.js`; `MulterError` → 400 in the error handler.
- **OpenAPI:** `product.docs.js`, `upload.docs.js`; shared `Product`, `Image`, `PageMeta` schemas.
- **Tests:** 218 new (418 in total): every route with 400/401/403/404/409, filters/search/sort/pagination, inactive hidden, a 10-buyers-3-items stock race, upload type/size/field/count limits with a fake Cloudinary. Factory `createProduct()`. Coverage ≈ 97.8% lines.
- **Postman / Bruno:** folder **04 Products & Uploads** (self-contained: admin login, own customer for 403s, own category and products, cleans up after itself; no Cloudinary keys needed).
- **Docs:** module guide, mind map, concepts [16 – Catalog queries](docs/concepts/16-catalog-queries.md) and [17 – File uploads and a CDN](docs/concepts/17-file-uploads-and-cdn.md), folder READMEs.

### Changed (compared with the reference)
- Friendly 409 for a duplicate SKU (index still the guarantee); `_id` tie-breaker in every sort; extra `{ isActive, price }` index.
- Unknown `?folder=` → 400; `DELETE /uploads/image` only for `shopease/…` publicIds; upload handlers split into controller + validation.
- Products are hard-deleted for now (soft delete when used in orders arrives with orders, branch 07); review routes arrive in branch 09; admin list/low-stock/detail handlers are mounted by branch 10.

---

## 03 – categories (`03-categories`)

Ported from the reference app's `categories` module and its shared helpers (`slugify`, the image sub-schema), adapted to this repo's conventions.

### Added
- **Categories module** (`/api/categories`): the first resource with **public** reads and **admin-only** writes.
  - `GET /api/categories` and `GET /api/categories/:slug` need no token and show **active** categories only. An inactive category is a 404, like a missing one.
  - `POST`, `PUT /:id`, `DELETE /:id` need `protect` + `authorize('admin')` (401 / 403 otherwise).
  - **Slugs** are generated from the name by a model hook (`Men's Shoes` → `mens-shoes`), are unique (`-2`, `-3`… when taken), follow renames, and are never taken from the body.
  - **Names** are unique ignoring case (unique index with a `collation`), with a friendly 409 from the service and the index as the race-proof safety net.
  - **Two levels** at most: the parent must be top-level, nothing is its own parent, and a category with children can't become a child (400). A category with sub-categories can't be deleted (400).
  - Optional `image` `{ url, publicId }`: the URL must be on Cloudinary (`https://res.cloudinary.com/`). `null` removes it.
- **Shared helpers:** `src/db/utils/slugify.js` (`slugify`, `uniqueSlug`) and `src/db/schemas/image.schema.js`.
- **Constants:** `REGEX.SLUG`, `REGEX.CLOUDINARY_URL`.
- **OpenAPI:** `modules/categories/category.docs.js`; new shared `Category` and `Image` schemas. GET-by-slug and PUT/DELETE-by-id share the path `/categories/{slugOrId}`, because OpenAPI (like Express) treats `/{slug}` and `/{id}` as the same path.
- **Tests:** 95 new (295 in total): `categories.test.js` (401/403 on every admin route, public vs inactive, slug numbering/fallback/rename, 409 in any case and under a race, every hierarchy rule, delete rules, mass assignment), `category.model.test.js`, `slugify.test.js`. Factory `createCategory(overrides)`. Coverage ≈ 98% lines.
- **Postman / Bruno:** folder **03 Categories**. Self-contained and email-free: it logs in the seeded admin, registers a customer for the 403 checks, uses a unique name per run and deletes what it created.
- **Docs:** module guide, mind map, concept [15 – Slugs and public vs admin APIs](docs/concepts/15-slugs-and-public-vs-admin-apis.md), glossary terms, folder READMEs.

### Changed (compared with the reference)
- The hierarchy rules live in the service only (400 `ApiError`). The reference also checked them in the model hook with a plain `Error`, which became a 500.
- `PUT /api/categories/:id` is a partial update (`updateCategoryRules`: every field optional). Full bodies, as the reference frontend sends them, still work.
- Duplicate names get a service-level 409 `A category with this name already exists` (with `errors: [{ field: 'name' }]`) before the index is hit.
- An image object must contain both `url` and `publicId`.
- Public reads return full documents instead of `.lean()` ones, so the toJSON plugin removes `__v`.
- Not ported yet: the "products use this category" delete check and deleting old images from Cloudinary (both branch 04, marked `// Branch 04:` in `category.service.js`), and the admin list with product counts (`/api/admin/categories`, branch 10).

---

## 02 – profile & addresses (`02-profile-addresses`)

Ported from the reference app's `users` (profile part) and `addresses` modules, adapted to this repo's conventions.

### Added
- **Profile:** `GET /api/users/profile` and `PUT /api/users/profile`. Only `name` and `phone` can change; every other field in the body is ignored (mass assignment). `phone: ""` or `null` removes the phone.
- **`phone` on User:** optional, Pakistani format `03XXXXXXXXX`.
- **Addresses module** (`/api/addresses`, customers only): list, create, update, delete, set default.
  - At most 5 addresses per customer (400 on the 6th).
  - Exactly one default: the first address becomes the default, `isDefault: true` moves it, and deleting the default promotes the newest remaining address. The change runs in a **MongoDB transaction**, and a **unique partial index** (`one_default_address_per_user`) makes two defaults impossible at the database level.
  - **Ownership:** every query filters by the logged-in user. Another customer's address id gives **404** (no IDOR). Admins get 403.
- **`validateObjectId(...names)`** middleware: malformed `:id` → 400 "Invalid id" before any query runs.
- **Constants:** `PROVINCES`, `ADDRESS_LABELS`, `LIMITS.MAX_ADDRESSES`, `REGEX.PK_PHONE`, `REGEX.POSTAL_CODE`.
- **OpenAPI:** `modules/users/user.docs.js` (profile + password, moved out of `auth.docs.js`) and `modules/addresses/address.docs.js`; new shared `Address` schema and `NotFound` response.
- **Tests:** 94 new (200 in total): `profile.test.js`, `addresses.test.js` (401/403 for every route, IDOR on every verb, limits, default rules, transaction rollback, mass assignment), `address.model.test.js`, `validateObjectId.test.js`. Factories `validAddress()` and `createAddress()`. Coverage ≈ 98% lines.
- **Postman / Bruno:** folder **02 Profile & Addresses**. It's self-contained: it registers and verifies its own customer through Mailpit, uses a second customer for the ownership checks, and logs in the admin for the 403 check.
- **Docs:** module guide, mind map, concept [14 – Ownership and IDOR](docs/concepts/14-authorization-ownership.md), glossary terms, folder READMEs.

### Changed (compared with the reference)
- The max-5 rule and "first address is default" live in the service only. The reference also had a model hook that threw a plain `Error`, which became a 500.
- The default switch is a service function using `connection.transaction()` and `ApiError(404)`, instead of a model static that threw an `Error` with a `statusCode`.
- `validateObjectId` uses `isObjectIdOrHexString` (`isValidObjectId` accepts any 12-character string), and its 400 now also lists `errors: [{ field, message }]`.
- Not ported yet: `avatar` (branch 04, uploads), `Address#toSnapshot` (branch 07, orders), admin customer management (branch 10).

---

## 01 – auth (`main`)

The starting point is `auth-server.zip`: the auth part of the ShopEase API, cut out of the full store. This branch keeps its behaviour and makes it production quality and easy to learn from.

### Fixed
- **Old login tokens could survive a password change.** The original code saved `passwordChangedAt = now − 1 second` and rejected tokens whose `iat` (issued-at time) was older. But JWT `iat` is stored in **whole seconds**. A token created less than about a second before the password change still looked "newer" and kept working. The new tests caught this.
  **Fix:** a `tokenVersion` counter on the user. Every JWT carries the version it was created with (`v`). Changing or resetting the password adds 1 to the counter, so every older token is rejected, however close in time it was made. See [docs/concepts/05-jwt-and-sessions.md](docs/concepts/05-jwt-and-sessions.md).

### Changed
- `requireVerifiedEmail` now says "Please verify your email address to continue" instead of mentioning orders, so any module can reuse it.
- `seedAdmin` no longer touches an existing **customer** with the same email. It stops with a clear error instead of silently promoting that account to admin.
- Email templates **HTML-escape** the user's name, so a name like `<script>` cannot inject HTML into an email.
- Google sign-in calls Google through a small wrapper (`google.verifier.js`), so tests can replace it with a fake.
- Errors in `NODE_ENV=test` are not printed, and request logging (morgan) is off during tests.
- `ADMIN_EMAIL` is lower-cased when read, so it always matches how emails are stored.
- Every file now has a header comment and beginner-level line comments.

### Added
- **Automated tests:** Jest + Supertest + mongodb-memory-server (in-memory replica set). 106 tests in total: unit tests and integration tests for every route, including security cases. About 98% line coverage, and the run fails below 90%.
- **Test email outbox:** in tests, `sendEmail` stores emails in memory, so tests read verification and reset links like a real user would.
- **API docs:** Swagger UI at `/api/docs`, raw OpenAPI spec at `/api/docs.json`.
- **`RATE_LIMIT_ENABLED` switch:** set it to `false` for repeated Postman runs. It is always on unless you set exactly `false`.
- **Code quality:** ESLint + Prettier, Husky pre-commit hook (lint-staged + tests).
- **CI:** GitHub Actions workflow (lint, format check, tests with coverage). It starts running once the repo is on GitHub.
- **Docker Compose:** Mailpit for local email.
- **API collections:** Postman collection + environment (run with Newman: `npm run test:api`) and a Bruno collection (`npm run test:bruno`). Both read tokens straight from Mailpit.
- **Documentation:** concept docs, mind maps, module guide, testing guide, setup/git/deploy guides and folder READMEs.
