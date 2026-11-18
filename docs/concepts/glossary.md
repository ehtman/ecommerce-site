# Glossary (A–Z)

| Term | Simple meaning |
|---|---|
| **API** | A set of URLs a program can call to use our system. |
| **ApiError** | Our Error class that carries an HTTP status code (`utils/ApiError.js`). |
| **asyncHandler** | Wrapper that sends errors from async controllers to the error handler. |
| **Atlas** | MongoDB's hosted cloud database service. |
| **Authentication (AuthN)** | Proving who you are (login). Fails with 401. |
| **Authorization (AuthZ)** | Checking what you're allowed to do. Fails with 403. |
| **Bearer token** | A token sent as `Authorization: Bearer <token>`. Whoever holds ("bears") it gets access. |
| **bcrypt** | A slow, salted password-hashing algorithm. |
| **Brute force** | Guessing passwords by trying very many. Stopped by rate limits. |
| **Bruno** | Open-source API client; collections are plain files in git. |
| **CI/CD** | Automatically testing (CI) and deploying (CD) on every push. |
| **Collection (MongoDB)** | A group of documents, like a table. |
| **Collection (Postman/Bruno)** | A saved, ordered set of API requests with tests. |
| **Controller** | Layer that turns an HTTP request into a service call and sends the response. |
| **CORS** | Browser rule controlling which websites may call our API. |
| **Coverage** | How much of the code ran during tests. |
| **Document** | One record in MongoDB (JSON-like). |
| **dotenv** | Library that loads `.env` into `process.env`. |
| **E2E test** | End-to-end test: the whole running system, like a real user. |
| **Endpoint / route** | One method + URL, e.g. `POST /api/auth/login`. |
| **Enumeration** | Finding out which accounts exist from different error messages. |
| **Environment variable** | A setting given to a program from outside its code. |
| **Express** | Minimal Node.js web framework. |
| **Factory (tests)** | Helper that creates test data (`createUser()`). |
| **Fail fast** | Stop immediately with a clear error instead of failing later and confusingly. |
| **Hash** | One-way fingerprint of data. Can't be reversed. |
| **helmet** | Middleware that sets security-related HTTP headers. |
| **Hook (Mongoose)** | Code that runs automatically before/after an event (e.g. `pre('save')`). |
| **HTTP** | The text protocol browsers and servers use to talk. |
| **Husky** | Tool that runs scripts on git events (pre-commit). |
| **iat / exp** | JWT "issued at" / "expires at" times, in seconds. |
| **Idempotent** | Running it twice has the same effect as running it once (`seed:admin`). |
| **Invariant** | A rule that must always be true, e.g. "a customer with addresses has exactly one default". |
| **Index** | Database lookup structure that makes searches fast. |
| **IDOR** | Insecure Direct Object Reference: reaching someone else's data just by changing an id in the URL. Prevented by ownership checks. |
| **Integration test** | Tests several layers together (route → DB). |
| **Jest** | JavaScript test runner. |
| **JSON** | Text format for data: `{ "key": "value" }`. |
| **JWT** | JSON Web Token: signed token carrying `id`, `role`, `v`. |
| **lint-staged** | Runs linters only on files staged for commit. |
| **Load balancer** | Spreads requests across several server copies. |
| **Mailpit** | Fake email server with a web inbox for development. |
| **Mass assignment** | Saving every field the client sent, including ones it shouldn't control. |
| **Middleware** | Function `(req, res, next)` that runs before the controller. |
| **Model** | Mongoose schema + collection + methods. |
| **Mongoose** | Library that adds schemas and helpers on top of MongoDB. |
| **mongodb-memory-server** | Starts a real MongoDB in memory for tests. |
| **Newman** | Command-line runner for Postman collections. |
| **NoSQL injection** | Sneaking query operators (`$ne`) into input to change a query. |
| **ObjectId** | MongoDB's 12-byte unique id type, written as 24 hex characters. `validateObjectId` rejects anything else with 400. |
| **Ownership check** | Resource-level authorization: "is this record yours?". Done by putting the owner id in the query. |
| **OpenAPI** | Standard format describing an API. |
| **OWASP** | Non-profit that publishes common web-security risks (Top 10). |
| **Partial index** | An index that only contains documents matching a filter (`partialFilterExpression`). A unique partial index enforces "one default address per user". |
| **Partial update** | An update where fields that aren't sent keep their old value (`PUT /users/profile`). |
| **Payload (JWT)** | The middle part of a JWT holding the claims. |
| **Prettier** | Automatic code formatter. |
| **Rate limiting** | Capping requests per client per time window (429). |
| **RBAC** | Role-Based Access Control (customer / admin). |
| **Regression** | A bug in something that used to work. |
| **Replica set** | Several MongoDB servers with copies of the data; needed for transactions. |
| **REST** | URL design style: resources as nouns, actions as HTTP methods. |
| **Salt** | Random data added before hashing so equal passwords get different hashes. |
| **Sanitize** | Clean input (trim, lowercase, strip `$` keys). |
| **Schema** | Definition of a document's fields and rules. |
| **Seed** | Script that inserts starting data (the admin user). |
| **Service** | Layer with business rules; knows nothing about HTTP. |
| **SHA-256** | Fast one-way hash; used for random email/reset tokens. |
| **Sparse index** | Index that skips documents missing the field. |
| **Stateless** | Server keeps no per-client memory between requests. |
| **Status code** | Number in a response saying how it went (200, 401…). |
| **Stub** | Fake replacement of a dependency in tests (fake Google verifier). |
| **Supertest** | Library to send HTTP requests to an Express app in tests. |
| **Swagger UI** | Web page that displays an OpenAPI spec and lets you try requests. |
| **tokenVersion** | Counter on the user; bumping it invalidates all older JWTs. |
| **Transaction** | Several writes that all succeed or all fail together. |
| **TTL** | Time To Live: how long something stays valid. |
| **Unique index** | Index that refuses duplicate values. |
| **Unit test** | Tests one small piece in isolation. |
| **Validation** | Checking input is acceptable before using it. |
