# src/db/: database helpers and scripts

| Path                     | What it does                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins/toJSON.js`      | Mongoose plugin: removes `password`, token hashes/expiries, `__v` and `id` whenever a document becomes JSON. Applied to every model. |
| `scripts/seedAdmin.js`   | `npm run seed:admin`: creates the admin from `ADMIN_*` env vars. Idempotent. Refuses if the email belongs to a customer.             |
| `scripts/syncIndexes.js` | `npm run db:indexes`: `syncIndexes()` for every model in `modules/models.js` (creates missing, drops removed). Use in production.    |

Later branches add `schemas/` (shared sub-schemas such as images) and `utils/` (slugify) here.
