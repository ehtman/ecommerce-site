# tests/: automated tests (Jest)

| Path                            | What's inside                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup/globalSetup.js`          | Starts one in-memory MongoDB **replica set** for the whole run                                                                                                   |
| `setup/globalTeardown.js`       | Stops it                                                                                                                                                         |
| `setup/env.js`                  | Fake env vars before every file; one database per Jest worker; rate limits off                                                                                   |
| `helpers/db.js`                 | `connectTestDB`, `clearTestDB` (also empties the email outbox), `closeTestDB`                                                                                    |
| `helpers/factories.js`          | `api()`, `createUser()`, `createAdmin()`, `loggedIn()`, `bearer()`, `uniqueEmail()`, `tokenFromLastEmail()`, `PASSWORD`, `validAddress()`, `createAddress(user)` |
| `unit/user.model.test.js`       | Defaults, validation, `comparePassword`, `isTokenOutdated`, hashed tokens, expiry, `toJSON`                                                                      |
| `unit/middleware.test.js`       | `authorize`, `requireVerifiedEmail`, `validate`, `notFound`, `errorHandler` mappings                                                                             |
| `unit/utils.test.js`            | `generateToken`, `ApiError`, `sendSuccess`, `asyncHandler`, templates + escaping, outbox                                                                         |
| `integration/auth.test.js`      | Every `/api/auth` route: happy paths, validation table, enumeration, injection, forged/expired tokens, email flows                                               |
| `integration/google.test.js`    | Google sign-in with a stubbed verifier: create, link, refuse admins/disabled, invalid tokens                                                                     |
| `integration/users.test.js`     | Change password: fresh token, old token revoked (`tokenVersion`), errors                                                                                         |
| `integration/profile.test.js`   | Profile get/update: partial update, clear phone, mass assignment ignored, 400s, admins too                                                                       |
| `integration/addresses.test.js` | Every `/api/addresses` route: 401/403 per route, IDOR → 404 on every verb, max 5, exactly-one-default rules, transaction rollback, unique partial index          |
| `unit/address.model.test.js`    | Address schema rules and defaults, the partial index definition, `User.phone`, new constants and regexes                                                         |
| `unit/validateObjectId.test.js` | `validateObjectId`: valid ids pass; short, non-hex, 12-char and missing ids → 400                                                                                |
| `integration/app.test.js`       | Health, 404 shape, OpenAPI coverage of routes, Swagger UI, helmet headers, CORS                                                                                  |
| `integration/rateLimit.test.js` | Limits switched ON: 6th admin-login attempt → 429                                                                                                                |
| `integration/db.test.js`        | `connectDB` connects and caches                                                                                                                                  |

Run: `npm test` · How it all works: [docs/testing/README.md](../../docs/testing/README.md)
