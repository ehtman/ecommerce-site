# src/db/: database helpers and scripts

| Path                     | What it does                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins/toJSON.js`      | Mongoose plugin: removes `password`, token hashes/expiries, `__v` and `id` whenever a document becomes JSON. Applied to every model. |
| `scripts/seedAdmin.js`   | `npm run seed:admin`: creates the admin from `ADMIN_*` env vars. Idempotent. Refuses if the email belongs to a customer.             |
| `scripts/syncIndexes.js` | `npm run db:indexes`: `syncIndexes()` for every model in `modules/models.js` (creates missing, drops removed). Use in production.    |

| `schemas/image.schema.js` | Shared `{ url, publicId }` sub-schema for one stored image. `url` must match `REGEX.CLOUDINARY_URL`. Used by categories (03) and products (04). |
| `utils/slugify.js` | `slugify(text)` ("Men's Shoes" → `mens-shoes`) and `uniqueSlug(Model, base, excludeId)` (adds `-2`, `-3`… until free). Used by the category model hook. Concept: [15](../../../docs/concepts/15-slugs-and-public-vs-admin-apis.md). |
