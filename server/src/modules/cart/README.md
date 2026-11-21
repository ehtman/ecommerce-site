# src/modules/cart/: the customer's shopping cart

Mounted at **`/api/cart`**. Every route needs `protect` + `authorize('customer')`. Admins get 403. There is no cart id in any URL: "my cart" comes from the token.

| File                 | What it does                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cart.model.js`      | The `Cart` schema: owner `user` (unique) and **embedded** `items` (`product`, `quantity` 1–10 whole, `addedAt`), one line per product. `itemCount` virtual. `Cart.forUser(userId, session?)` = get-or-create **upsert**.    |
| `cart.validation.js` | `addItemRules` (`productId` ObjectId, `quantity` 1–`LIMITS.MAX_CART_QTY`) and `updateItemRules`. No price fields on purpose.                                                                                                |
| `cart.service.js`    | `getCartWithTotals` (live prices, `issue` per line, subtotal, shipping, total, `hasIssues`), `addItem` (quantities add up), `updateItem`, `removeItem` (idempotent `$pull`), `clearCart`. BR-04 checks vs max 10 and stock. |
| `cart.controller.js` | Thin handlers: `getCart`, `addItem`, `updateItem`, `removeItem`, `clearCart`. All answer with the whole cart.                                                                                                               |
| `cart.routes.js`     | `GET /`, `POST /items`, `PUT /items/:productId`, `DELETE /items/:productId`, `DELETE /`.                                                                                                                                    |
| `cart.docs.js`       | OpenAPI for `/cart/*` (tag **Cart**), including the cart response schema.                                                                                                                                                   |

The cart is also created at sign-up by `auth.service.js` (transaction). Prices: `src/utils/pricing.js`.

Full guide: [docs/modules/05-cart-wishlist.md](../../../../docs/modules/05-cart-wishlist.md) · Mind map: [docs/mind-maps/05-cart-wishlist.md](../../../../docs/mind-maps/05-cart-wishlist.md) · Concept: [18 – Transactions and atomic updates](../../../../docs/concepts/18-transactions-and-atomic-updates.md)
Tests: `tests/integration/cart.test.js`, `tests/integration/signupTransaction.test.js`, `tests/unit/cart.model.test.js`, `tests/unit/pricing.test.js`
