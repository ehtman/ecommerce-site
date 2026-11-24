# Glossary (A–Z)

| Term | Simple meaning |
|---|---|
| **ACID** | Atomicity, Consistency, Isolation, Durability: the promises a transaction makes. See [20](20-transactions-and-race-conditions.md). |
| **`$addToSet` / `$pull`** | MongoDB operators: add a value to an array only if missing / remove matching values. See [18](18-transactions-and-atomic-updates.md). |
| **Aggregation pipeline** | A list of stages (`$match`, `$group`, `$sort`…) that MongoDB runs inside the database to calculate results instead of returning raw documents. See [23](23-ratings-aggregation-moderation.md). |
| **API** | A set of URLs a program can call to use our system. |
| **ApiError** | Our Error class that carries an HTTP status code (`utils/ApiError.js`). |
| **asyncHandler** | Wrapper that sends errors from async controllers to the error handler. |
| **Atlas** | MongoDB's hosted cloud database service. |
| **At-least-once delivery** | A guarantee that a message arrives one or more times, so receivers must be idempotent. See [22](22-webhooks-signatures-idempotency.md). |
| **Atomic conditional update** | One database operation that checks a condition and changes the document together (e.g. `stock >= qty` then `$inc`), so nothing can happen in between. See [20](20-transactions-and-race-conditions.md). |
| **Atomic operation** | An operation nobody can see half-done: it happens completely or not at all. See [18](18-transactions-and-atomic-updates.md) and [19](19-coupons-money-math-and-atomic-counters.md) (conditional `$inc`). |
| **Atomic update** | A condition and a change applied by the database in one step (`updateOne` + `$inc`), so concurrent requests can't oversell. See [16](16-catalog-queries.md). |
| **Audit trail** | A history of who changed what, when and why (`statusHistory`). See [21](21-state-machines-and-snapshots.md). |
| **Authentication (AuthN)** | Proving who you are (login). Fails with 401. |
| **Authorization (AuthZ)** | Checking what you're allowed to do. Fails with 403. |
| **Bearer token** | A token sent as `Authorization: Bearer <token>`. Whoever holds ("bears") it gets access. |
| **bcrypt** | A slow, salted password-hashing algorithm. |
| **Brute force** | Guessing passwords by trying very many. Stopped by rate limits. |
| **Bruno** | Open-source API client; collections are plain files in git. |
| **CDN** | Content Delivery Network: copies of files on servers worldwide, served from the nearest one. See [17](17-file-uploads-and-cdn.md). |
| **Checkout Session** | Stripe's object for one hosted payment page; has an `id` (`cs_…`) and a `url`. See [22](22-webhooks-signatures-idempotency.md). |
| **CI/CD** | Automatically testing (CI) and deploying (CD) on every push. |
| **Cloudinary / publicId** | The image service we use / an image's name inside it (needed to delete it). See [17](17-file-uploads-and-cdn.md). |
| **COD** | Cash on Delivery: the customer pays the courier; the order becomes paid when delivered. See [21](21-state-machines-and-snapshots.md). |
| **Collation** | Rules for comparing text. `{ locale: 'en', strength: 2 }` ignores upper/lower case ("Shoes" = "SHOES"). |
| **Collection (MongoDB)** | A group of documents, like a table. |
| **Collection (Postman/Bruno)** | A saved, ordered set of API requests with tests. |
| **Collection scan / IXSCAN** | Reading every document vs. using an index (`explain()`). See [16](16-catalog-queries.md). |
| **Compound index** | One index over several fields, serving "filter on the first, sort on the next" queries. See [16](16-catalog-queries.md). |
| **Compound unique index** | An index over several fields that refuses two documents with the same *combination* of values, e.g. one review per `{ product, user }`. See [23](23-ratings-aggregation-moderation.md). |
| **Constant-time comparison** | Comparing secrets in a way that takes the same time no matter where they differ (`crypto.timingSafeEqual`). See [22](22-webhooks-signatures-idempotency.md). |
| **Controller** | Layer that turns an HTTP request into a service call and sends the response. |
| **CORS** | Browser rule controlling which websites may call our API. |
| **Coupon** | A code that gives a discount, e.g. `EID25`. Percentage or fixed amount, with rules for when and how often it works. See [19](19-coupons-money-math-and-atomic-counters.md). |
| **Coverage** | How much of the code ran during tests. |
| **Cron job** | A task a scheduler runs on a timetable (cron syntax like `0 3 * * *`). See [22](22-webhooks-signatures-idempotency.md). |
| **Denormalized counter** | A calculated copy of data stored for fast reads (e.g. `ratingAverage` on the product), kept in sync on every write. See [23](23-ratings-aggregation-moderation.md). |
| **Document** | One record in MongoDB (JSON-like). |
| **dotenv** | Library that loads `.env` into `process.env`. |
| **E2E test** | End-to-end test: the whole running system, like a real user. |
| **Embedded sub-document** | An object stored inside a parent document (cart lines inside the cart) instead of in its own collection. See [18](18-transactions-and-atomic-updates.md). |
| **Endpoint / route** | One method + URL, e.g. `POST /api/auth/login`. |
| **Enumeration** | Finding out which accounts exist from different error messages. |
| **Environment variable** | A setting given to a program from outside its code. |
| **Express** | Minimal Node.js web framework. |
| **Factory (tests)** | Helper that creates test data (`createUser()`). |
| **Fail fast** | Stop immediately with a clear error instead of failing later and confusingly. |
| **Feature flag** | A setting that turns a feature on or off without changing code (`PAYMENT_CARD_ENABLED`). See [22](22-webhooks-signatures-idempotency.md). |
| **Hash** | One-way fingerprint of data. Can't be reversed. |
| **helmet** | Middleware that sets security-related HTTP headers. |
| **HMAC** | A fingerprint of a message that can only be made with a secret key (e.g. HMAC-SHA256). See [22](22-webhooks-signatures-idempotency.md). |
| **Hook (Mongoose)** | Code that runs automatically before/after an event (e.g. `pre('save')`). |
| **Hosted checkout** | A payment page shown on the provider's own website, so the shop never handles card numbers. See [22](22-webhooks-signatures-idempotency.md). |
| **HTTP** | The text protocol browsers and servers use to talk. |
| **Husky** | Tool that runs scripts on git events (pre-commit). |
| **iat / exp** | JWT "issued at" / "expires at" times, in seconds. |
| **Idempotency key** | A client-chosen unique key that lets the server recognise a repeated request. See [20](20-transactions-and-race-conditions.md). |
| **Idempotent** | Running it twice has the same effect as running it once (`seed:admin`, `$addToSet`, `DELETE`). See [18](18-transactions-and-atomic-updates.md). |
| **Integer money** | Storing amounts as whole numbers of the smallest unit (rupees here, cents elsewhere) to avoid floating-point errors. See [19](19-coupons-money-math-and-atomic-counters.md). |
| **Invariant** | A rule that must always be true, e.g. "a customer with addresses has exactly one default". |
| **Index** | Database lookup structure that makes searches fast. |
| **IDOR** | Insecure Direct Object Reference: reaching someone else's data just by changing an id in the URL. Prevented by ownership checks. |
| **Integration test** | Tests several layers together (route → DB). |
| **Jest** | JavaScript test runner. |
| **JSON** | Text format for data: `{ "key": "value" }`. |
| **JWT** | JSON Web Token: signed token carrying `id`, `role`, `v`. |
| **lint-staged** | Runs linters only on files staged for commit. |
| **Load balancer** | Spreads requests across several server copies. |
| **Lost update** | Two read-modify-write cycles overlap and one write overwrites the other. See [19](19-coupons-money-math-and-atomic-counters.md). |
| **Mailpit** | Fake email server with a web inbox for development. |
| **Mass assignment** | Saving every field the client sent, including ones it shouldn't control. |
| **Middleware** | Function `(req, res, next)` that runs before the controller. |
| **MIME type** | The declared content type of a file, e.g. `image/png` (a claim, not a proof). See [17](17-file-uploads-and-cdn.md). |
| **Minor units** | The smallest unit of a currency (paisa, cents); payment APIs use whole numbers of them. See [22](22-webhooks-signatures-idempotency.md). |
| **Model** | Mongoose schema + collection + methods. |
| **Moderation** | The shop controlling what user content the public sees (hide/show/delete reviews). See [23](23-ratings-aggregation-moderation.md). |
| **Mongoose** | Library that adds schemas and helpers on top of MongoDB. |
| **mongodb-memory-server** | Starts a real MongoDB in memory for tests. |
| **Multer** | Express middleware that parses multipart bodies. See [17](17-file-uploads-and-cdn.md). |
| **Multipart (`multipart/form-data`)** | The HTTP body format browsers use to send files. See [17](17-file-uploads-and-cdn.md). |
| **Newman** | Command-line runner for Postman collections. |
| **NoSQL injection** | Sneaking query operators (`$ne`) into input to change a query. |
| **ObjectId** | MongoDB's 12-byte unique id type, written as 24 hex characters. `validateObjectId` rejects anything else with 400. |
| **Orphan file** | An uploaded file that no record uses any more. See [17](17-file-uploads-and-cdn.md). |
| **Ownership check** | Resource-level authorization: "is this record yours?". Done by putting the owner id in the query. |
| **OpenAPI** | Standard format describing an API. |
| **OWASP** | Non-profit that publishes common web-security risks (Top 10). |
| **Pagination** | Returning a long list one page at a time (`page`, `limit`, `skip`, `total`, `pages`). See [16](16-catalog-queries.md). |
| **Parent / sub-category** | A category whose `parent` points to another category. ShopEase allows two levels (`Men → Shoes`). |
| **Partial index** | An index that only contains documents matching a filter (`partialFilterExpression`). A unique partial index enforces "one default address per user". |
| **Partial update** | An update where fields that aren't sent keep their old value (`PUT /users/profile`). |
| **Payload (JWT)** | The middle part of a JWT holding the claims. |
| **Payment provider** | A company (Stripe, PayPal, a bank gateway) that moves money from a card to the shop's account. See [22](22-webhooks-signatures-idempotency.md). |
| **Post hook (Mongoose)** | A function that runs after a database operation succeeded (`schema.post('save', fn)`). See [23](23-ratings-aggregation-moderation.md). |
| **Prettier** | Automatic code formatter. |
| **Public route** | A route that needs no token (`GET /api/categories`). Writes to the same resource stay admin-only. |
| **Race condition** | A bug where the result depends on the timing of overlapping requests, e.g. two checkouts both taking the "last" coupon use. See [19](19-coupons-money-math-and-atomic-counters.md) and [20](20-transactions-and-race-conditions.md). |
| **Rate limiting** | Capping requests per client per time window (429). |
| **Raw body** | The exact bytes of a request body before JSON parsing; needed to check a signature. See [22](22-webhooks-signatures-idempotency.md). |
| **RBAC** | Role-Based Access Control (customer / admin). |
| **ReDoS** | A denial of service through a regular expression that takes very long to evaluate; prevented by escaping user text. See [16](16-catalog-queries.md). |
| **Regression** | A bug in something that used to work. |
| **Replay attack** | Re-sending a captured valid request later; blocked by signed timestamps with a short tolerance. See [22](22-webhooks-signatures-idempotency.md). |
| **Replica set** | Several MongoDB servers with copies of the data; needed for transactions. |
| **REST** | URL design style: resources as nouns, actions as HTTP methods. |
| **Rollback** | Undoing every write of a transaction that failed (abort). See [18](18-transactions-and-atomic-updates.md). |
| **Salt** | Random data added before hashing so equal passwords get different hashes. |
| **Sanitize** | Clean input (trim, lowercase, strip `$` keys). |
| **Schema** | Definition of a document's fields and rules. |
| **Seed** | Script that inserts starting data (the admin user). |
| **Server-side price calculation** | The server reads prices from the database and computes totals; prices from the client are never trusted. See [18](18-transactions-and-atomic-updates.md). |
| **SKU** | Stock Keeping Unit: the shop's own unique article number. See [16](16-catalog-queries.md). |
| **Slug** | The readable, URL-friendly version of a name (`Men's Shoes` → `mens-shoes`). Generated by the server, unique per collection. |
| **Snapshot** | A copy of data as it was at one moment (an order copies prices, the address and the coupon). See [21](21-state-machines-and-snapshots.md). |
| **Soft delete** | Hiding a record (`isActive: false`) instead of deleting it, so history that points at it stays valid (used coupons). See [19](19-coupons-money-math-and-atomic-counters.md). |
| **Soft hide (deactivate)** | Switching a record off (`isActive: false`) instead of deleting it; the public API then answers 404. |
| **Service** | Layer with business rules; knows nothing about HTTP. |
| **SHA-256** | Fast one-way hash; used for random email/reset tokens. |
| **Sparse index** | Index that skips documents missing the field. |
| **State machine** | Something that is always in exactly one state and may only move along a fixed list of transitions (an order's status). See [21](21-state-machines-and-snapshots.md). |
| **Stateless** | Server keeps no per-client memory between requests. |
| **Status code** | Number in a response saying how it went (200, 401…). |
| **Stub** | Fake replacement of a dependency in tests (fake Google verifier, fake Cloudinary client). |
| **Supertest** | Library to send HTTP requests to an Express app in tests. |
| **Swagger UI** | Web page that displays an OpenAPI spec and lets you try requests. |
| **Text index** | A MongoDB index that splits text into words (with stemming and weights) for `$text` search. See [16](16-catalog-queries.md). |
| **Tie-breaker (sort)** | A unique field (`_id`) at the end of a sort so equal values keep a stable order between pages. See [16](16-catalog-queries.md). |
| **tokenVersion** | Counter on the user; bumping it invalidates all older JWTs. |
| **Transaction** | Several writes that all succeed or all fail together (possibly in several collections). Needs a replica set. See [18](18-transactions-and-atomic-updates.md). |
| **TTL** | Time To Live: how long something stays valid. |
| **Unique index** | Index that refuses duplicate values. |
| **Unit test** | Tests one small piece in isolation. |
| **Upsert** | An update that inserts the document when nothing matches (`{ upsert: true }`). See [18](18-transactions-and-atomic-updates.md). |
| **Validation** | Checking input is acceptable before using it. |
| **Validity window** | The time between `startsAt` and `expiresAt` in which a coupon (or offer, or token) works. See [19](19-coupons-money-math-and-atomic-counters.md). |
| **Verified buyer** | A reviewer with a delivered order containing the product. See [23](23-ratings-aggregation-moderation.md). |
| **Virtual (Mongoose)** | A field computed on demand, not stored, e.g. a category's `children`. |
| **Webhook** | An HTTP request a provider's server sends to *your* URL when something happens ("reverse API call"). See [22](22-webhooks-signatures-idempotency.md). |
| **Webhook signature** | An HMAC of the request body made with a shared secret; proves the webhook came from the provider and wasn't changed. See [22](22-webhooks-signatures-idempotency.md). |
| **Whitelist (query)** | Reading only known query parameters and ignoring the rest. See [16](16-catalog-queries.md). |
| **Write conflict** | MongoDB stopping one of two transactions that changed the same document; `withTransaction()` retries it. See [20](20-transactions-and-race-conditions.md). |
