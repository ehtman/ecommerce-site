# Changelog

One entry per branch. Each entry says what the branch added or changed compared with the step before.

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
