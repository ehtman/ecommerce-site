# src/modules/: one folder per feature

Every module has the same **anatomy**. Learn it once, read every module.

| File                   | Layer          | Job                                                                        |
| ---------------------- | -------------- | -------------------------------------------------------------------------- |
| `<name>.model.js`      | Model          | Mongoose schema: fields, rules, indexes, hooks, methods                    |
| `<name>.validation.js` | Edge           | express-validator rules for each route's input                             |
| `<name>.service.js`    | Business logic | The rules. No `req`/`res`. Throws `ApiError`                               |
| `<name>.controller.js` | HTTP           | Read `req` → call one service → `sendSuccess`                              |
| `<name>.routes.js`     | Routing        | URL + method → limiter / `protect` / `authorize` / `validate` → controller |
| `<name>.docs.js`       | Docs           | OpenAPI paths for this module (merged in `src/docs/openapi.js`)            |

Build order when writing a new module: **model → validation → service → controller → routes → mount in `app.js` → docs → tests**.

| Path                                  | Module                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`auth/`](auth/README.md)             | Register, login, Google, verify email, reset password                                               |
| [`users/`](users/README.md)           | The User model + the logged-in user's account (profile, change password)                            |
| [`addresses/`](addresses/README.md)   | A customer's saved delivery addresses (ownership, one default, max 5)                               |
| [`categories/`](categories/README.md) | Product categories: public reads by slug, admin-only writes, two levels                             |
| [`products/`](products/README.md)     | The catalogue: public list (filters, text search, sort, pagination), admin CRUD, stock with history |
| [`uploads/`](uploads/README.md)       | Admin image uploads to Cloudinary (multipart → `{ url, publicId }`)                                 |
| [`cart/`](cart/README.md)             | A customer's cart: embedded lines, live prices, max 10 per product, shipping                        |
| [`wishlist/`](wishlist/README.md)     | A customer's saved products: idempotent add, max 100                                                |
| [`coupons/`](coupons/README.md)       | Discount codes: customer preview on the cart, admin CRUD, atomic usage counter                      |
| [`orders/`](orders/README.md)         | Checkout in one transaction, order history, cancel, admin status machine                            |
| [`payments/`](payments/README.md)     | Card payments with Stripe: hosted checkout, signed webhook, expiry cron job                         |
| [`reviews/`](reviews/README.md)       | Product reviews: delivered buyers only, one per product, ★ average on the product, admin moderation |
| [`admin/`](admin/README.md)           | Admin only: dashboard, sales reports + CSV exports, inventory, customer management                  |
| `models.js`                           | Re-exports every model: `import { User } from '../models.js'`                                       |

Each new branch adds a folder here, one line in `models.js` (if it has a model) and one line in `app.js`.

Guide: [docs/mind-maps/00-how-to-think.md](../../../docs/mind-maps/00-how-to-think.md).
