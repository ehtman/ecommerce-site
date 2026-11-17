# ShopEase – Auth Server (authentication + authorization only)

Extracted from the full ShopEase API. Everything store-related (products, cart, orders,
payments, coupons, reviews, uploads, etc.) has been removed.

## Setup
```bash
npm install
cp .env.example .env        # fill in MONGO_URI and JWT_SECRET at minimum
npm run seed:admin          # creates the admin user from ADMIN_* variables
npm run dev
npm test                    # unit tests, no database needed
```

## Endpoints
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/register | public | Register customer (sends verification email) |
| POST | /api/auth/login | public | Customer/admin login → JWT |
| POST | /api/auth/admin/login | public (admin only) | Admin login, stricter rate limit |
| POST | /api/auth/google | public | Google sign-in (ID token) |
| POST | /api/auth/logout | logged in | Stateless – client discards token |
| GET | /api/auth/me | logged in | Current user |
| POST | /api/auth/verify-email | public | Verify email with token |
| POST | /api/auth/resend-verification | logged in | Resend verification email |
| POST | /api/auth/forgot-password | public | Email a reset link |
| POST | /api/auth/reset-password | public | Set a new password with token |
| PUT | /api/users/password | logged in | Change password (returns fresh JWT) |

## Authorization middleware (`src/middleware/auth.middleware.js`)
```js
import { protect, authorize, requireVerifiedEmail } from './middleware/auth.middleware.js';

router.get('/admin/stuff',  protect, authorize('admin'),    handler); // admins only
router.post('/orders',      protect, authorize('customer'), requireVerifiedEmail, handler);
```
- `protect` – verifies the Bearer JWT, loads the user, rejects disabled accounts and tokens issued before a password change.
- `authorize(...roles)` – role check (`customer` / `admin`).
- `requireVerifiedEmail` – blocks unverified customers.

## Notes
- Registration no longer creates a cart/wishlist, so it doesn't need a MongoDB transaction/replica set.
- `User` model had its `phone` and `avatar` fields removed (profile data, not auth).
- Removed admin customer management (list/deactivate), since it depended on orders. `isActive` is still enforced at login and in `protect`.
- `.env` (real secrets) is intentionally NOT included. Use `.env.example`.
