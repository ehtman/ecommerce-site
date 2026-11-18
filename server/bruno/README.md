# bruno/: Bruno collection (optional)

Bruno is an open-source, offline API client. Requests are plain-text `.bru` files, so they live in git like code.

| Path                           | What it is                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bruno.json`                   | Collection definition ("ShopEase API")                                                                                                                                                                                                                                                                                                 |
| `environments/local.bru`       | `baseUrl`, `mailpitUrl`, `adminEmail`, `adminPassword` (+ variables the scripts fill)                                                                                                                                                                                                                                                  |
| `01 Auth/*.bru`                | The auth story in order: health → register → read verify email (Mailpit) → verify → login → me → forgot → read reset email → reset → login → change password → logout → admin login                                                                                                                                                    |
| `02 Profile & Addresses/*.bru` | Self-contained: register + verify a fresh customer (Mailpit) → profile get/update (mass assignment ignored, bad phone 400) → addresses: create, default rules, update, 400s, fill to 5, 6th refused → second customer gets 404 on my address (ownership) → admin gets 403 → delete default, newest takes over                          |
| `03 Categories/*.bru`          | Self-contained, no email: admin login + fresh customer → create (slug) → 409 duplicate in another case → 400 → customer 403 / no token 401 → sub-category → third level 400 → public list and get by slug → rename (old slug 404) → deactivate (public 404) → delete parent with child 400 → clean-up deletes → 404 → malformed id 400 |

**Before running:** API running, Mailpit running, admin seeded, `RATE_LIMIT_ENABLED=false`.

- App: Open Collection → select this folder → environment **local** → run the collection (or one folder).
- Terminal: `npm run test:bruno`.

Details: [docs/testing/README.md](../../docs/testing/README.md#5-bruno)
