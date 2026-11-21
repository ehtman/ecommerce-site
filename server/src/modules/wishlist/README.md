# src/modules/wishlist/: the customer's saved products

Mounted at **`/api/wishlist`**. Every route needs `protect` + `authorize('customer')`. Admins get 403. No request body: the product id is in the URL, the owner comes from the token.

| File                     | What it does                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wishlist.model.js`      | The `Wishlist` schema: owner `user` (unique) and `products` (ids, max `LIMITS.MAX_WISHLIST`). Statics: `forUser` (upsert), `addProduct` (atomic `$addToSet` with the limit inside the filter), `removeProduct` (`$pull`). |
| `wishlist.service.js`    | `getWishlist` (`{ productIds, items }`, inactive products hidden), `addProduct` (404 unknown/inactive, idempotent, 400 when full), `removeProduct` (idempotent).                                                          |
| `wishlist.controller.js` | Thin handlers: `getWishlist`, `addProduct`, `removeProduct`.                                                                                                                                                              |
| `wishlist.routes.js`     | `GET /`, `POST /:productId`, `DELETE /:productId` with `validateObjectId('productId')`.                                                                                                                                   |
| `wishlist.docs.js`       | OpenAPI for `/wishlist/*` (tag **Wishlist**).                                                                                                                                                                             |

The wishlist is also created at sign-up by `auth.service.js` (transaction).

Full guide: [docs/modules/05-cart-wishlist.md](../../../../docs/modules/05-cart-wishlist.md) · Concept: [18 – Transactions and atomic updates](../../../../docs/concepts/18-transactions-and-atomic-updates.md)
Tests: `tests/integration/wishlist.test.js`, `tests/unit/cart.model.test.js`
