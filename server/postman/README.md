# postman/: Postman collection

| File                                      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShopEase.postman_collection.json`        | All requests, one folder per module (**01 Auth**, **02 Profile & Addresses**, **03 Categories**). Each request has test scripts.                                                                                                                                                                                                                                                                                                       |
| `ShopEase.local.postman_environment.json` | Environment "ShopEase – local": `baseUrl`, `mailpitUrl`, `adminEmail`, `adminPassword`, plus variables the scripts fill (`email`, `password`, `token`, `oldToken`, `adminToken`, `verifyToken`, `resetToken`; folder 02: `customerEmail`, `customerToken`, `otherEmail`, `otherToken`, `addressId`, `addressId2`; folder 03: `categoryName`, `categoryNameUpper`, `categoryId`, `categorySlug`, `oldCategorySlug`, `childCategoryId`). |

**Before running:** API running, Mailpit running (`docker compose up -d`), admin seeded, `RATE_LIMIT_ENABLED=false` in `.env`.

- App: Import both files → choose the environment → run the whole collection (or one folder) in the Runner.
- Terminal: `npm run test:api` (Newman).

Every folder is **self-contained**: folder 02 registers and verifies its own customer, registers a second customer to prove it cannot touch the first one's addresses (404), and logs in the admin to prove admins get 403. Its "fill up to 5" request uses `pm.sendRequest` in a pre-request script to add the 3rd and 4th addresses, so the next request can check that the 6th is refused.

Folder **03 Categories** needs no email: it logs in the seeded admin, registers a fresh customer (the register response already contains a token, enough for the 403 checks) and uses `'Postman Cat ' + Date.now()` as a unique name per run. It checks slug generation, the case-insensitive 409, the two-level rule, public vs inactive, rename → new slug (old slug 404), "can't delete a parent with children", and deletes everything it created.

The "Mailpit – read … email" requests fetch `GET /api/v1/message/latest` from Mailpit and save the token from the link, so the email flows run without manual copying.

Details: [docs/testing/README.md](../../docs/testing/README.md#4-postman)
