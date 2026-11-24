# Request flows

One diagram per endpoint / user action, showing exactly which files and functions a request
passes through: middleware, validation, controller, service, database, emails, external services,
every error exit (`ApiError` → `errorHandler`) and the final response.

Diagrams are Mermaid: GitHub and VS Code (with a Mermaid preview extension) draw them automatically.
This index grows with every branch. It lists the flows that exist up to **10-admin**.

| Module | Endpoint / action | Flow |
|---|---|---|
| auth | POST /api/auth/register | [register](auth/register.md) |
| auth | POST /api/auth/login | [user-login](auth/user-login.md) |
| auth | POST /api/auth/admin/login | [admin-login](auth/admin-login.md) |
| auth | POST /api/auth/google | [google-login](auth/google-login.md) |
| auth | POST /api/auth/logout | [logout](auth/logout.md) |
| auth | GET /api/auth/me | [me](auth/me.md) |
| auth | POST /api/auth/verify-email | [verify-email](auth/verify-email.md) |
| auth | POST /api/auth/resend-verification | [resend-verification](auth/resend-verification.md) |
| auth | POST /api/auth/forgot-password | [forgot-password](auth/forgot-password.md) |
| auth | POST /api/auth/reset-password | [reset-password](auth/reset-password.md) |
| users | PUT /api/users/password | [change-password](users/change-password.md) |
| emails | internal sendEmail() helper | [send-email](emails/send-email.md) |
| users | GET /api/users/profile | [get-profile](users/get-profile.md) |
| users | PUT /api/users/profile | [update-profile](users/update-profile.md) |
| addresses | GET /api/addresses | [list-addresses](addresses/list-addresses.md) |
| addresses | POST /api/addresses | [create-address](addresses/create-address.md) |
| addresses | PUT /api/addresses/:id | [update-address](addresses/update-address.md) |
| addresses | DELETE /api/addresses/:id | [delete-address](addresses/delete-address.md) |
| addresses | PATCH /api/addresses/:id/default | [set-default-address](addresses/set-default-address.md) |
| categories | GET /api/categories | [list-categories](categories/list-categories.md) |
| categories | GET /api/categories/:slug | [get-category-by-slug](categories/get-category-by-slug.md) |
| categories | POST /api/categories | [create-category](categories/create-category.md) |
| categories | PUT /api/categories/:id | [update-category](categories/update-category.md) |
| categories | DELETE /api/categories/:id | [delete-category](categories/delete-category.md) |
| products | GET /api/products | [list-products](products/list-products.md) |
| products | GET /api/products/brands | [list-brands](products/list-brands.md) |
| products | GET /api/products/:slug | [get-product-by-slug](products/get-product-by-slug.md) |
| products | POST /api/products | [create-product](products/create-product.md) |
| products | PUT /api/products/:id | [update-product](products/update-product.md) |
| products | DELETE /api/products/:id | [delete-product](products/delete-product.md) |
| products | DELETE /api/products/:id/images/:imageId | [remove-product-image](products/remove-product-image.md) |
| products | PATCH /api/products/:id/stock | [update-product-stock](products/update-product-stock.md) |
| uploads | POST /api/uploads/image | [upload-image](uploads/upload-image.md) |
| uploads | DELETE /api/uploads/image | [delete-uploaded-image](uploads/delete-uploaded-image.md) |
| cart | GET /api/cart | [get-cart](cart/get-cart.md) |
| cart | POST /api/cart/items | [add-cart-item](cart/add-cart-item.md) |
| cart | PUT /api/cart/items/:productId | [update-cart-item](cart/update-cart-item.md) |
| cart | DELETE /api/cart/items/:productId | [remove-cart-item](cart/remove-cart-item.md) |
| cart | DELETE /api/cart | [clear-cart](cart/clear-cart.md) |
| wishlist | GET /api/wishlist | [get-wishlist](wishlist/get-wishlist.md) |
| wishlist | POST /api/wishlist/:productId | [add-to-wishlist](wishlist/add-to-wishlist.md) |
| wishlist | DELETE /api/wishlist/:productId | [remove-from-wishlist](wishlist/remove-from-wishlist.md) |
| coupons | POST /api/coupons/validate | [validate-coupon](coupons/validate-coupon.md) |
| coupons | GET /api/coupons | [list-coupons](coupons/list-coupons.md) |
| coupons | GET /api/coupons/:id | [get-coupon](coupons/get-coupon.md) |
| coupons | POST /api/coupons | [create-coupon](coupons/create-coupon.md) |
| coupons | PUT /api/coupons/:id | [update-coupon](coupons/update-coupon.md) |
| coupons | DELETE /api/coupons/:id | [delete-coupon](coupons/delete-coupon.md) |
| orders | POST /api/orders | [place-order](orders/place-order.md) |
| orders | GET /api/orders/my | [list-my-orders](orders/list-my-orders.md) |
| orders | GET /api/orders/:id | [get-order](orders/get-order.md) |
| orders | PATCH /api/orders/:id/cancel | [cancel-order](orders/cancel-order.md) |
| orders | GET /api/admin/orders | [admin-list-orders](orders/admin-list-orders.md) |
| orders | PATCH /api/admin/orders/:id/status | [admin-update-order-status](orders/admin-update-order-status.md) |
| payments | POST /api/payments/checkout-session | [create-checkout-session](payments/create-checkout-session.md) |
| payments | POST /api/payments/webhook | [stripe-webhook](payments/stripe-webhook.md) |
| payments | GET /api/payments/expire-unpaid, POST /api/payments/expire-unpaid | [expire-unpaid-orders](payments/expire-unpaid-orders.md) |
| reviews | GET /api/products/:id/reviews | [list-product-reviews](reviews/list-product-reviews.md) |
| reviews | GET /api/products/:id/reviews/eligibility | [check-review-eligibility](reviews/check-review-eligibility.md) |
| reviews | POST /api/products/:id/reviews | [create-review](reviews/create-review.md) |
| reviews | PUT /api/reviews/:id | [update-review](reviews/update-review.md) |
| reviews | DELETE /api/reviews/:id | [delete-review](reviews/delete-review.md) |
| reviews | GET /api/reviews/admin | [admin-list-reviews](reviews/admin-list-reviews.md) |
| reviews | PATCH /api/reviews/:id/visibility | [set-review-visibility](reviews/set-review-visibility.md) |
| admin | GET /api/admin/dashboard/stats | [dashboard-stats](admin/dashboard-stats.md) |
| admin | GET /api/admin/reports/sales | [sales-report](admin/sales-report.md) |
| admin | GET /api/admin/reports/sales/export | [export-sales-report-csv](admin/export-sales-report-csv.md) |
| admin | GET /api/admin/reports/orders/export | [export-orders-csv](admin/export-orders-csv.md) |
| admin | GET /api/admin/inventory | [inventory-overview](admin/inventory-overview.md) |
| admin | GET /api/admin/products/low-stock | [low-stock-products](admin/low-stock-products.md) |
| admin | GET /api/admin/users | [list-customers](admin/list-customers.md) |
| admin | GET /api/admin/users/:id | [get-customer](admin/get-customer.md) |
| admin | PATCH /api/admin/users/:id/status | [set-customer-status](admin/set-customer-status.md) |
| admin | GET /api/admin/categories | [list-categories](admin/list-categories.md) |
| admin | GET /api/admin/products | [list-products](admin/list-products.md) |
| admin | GET /api/admin/products/:id | [get-product](admin/get-product.md) |
| admin | GET /api/admin/orders | [list-orders](admin/list-orders.md) |
| admin | PATCH /api/admin/orders/:id/status | [update-order-status](admin/update-order-status.md) |
| admin | GET /api/admin/reviews | [list-reviews](admin/list-reviews.md) |
| admin | PATCH /api/admin/reviews/:id/visibility | [set-review-visibility](admin/set-review-visibility.md) |
| admin | GET /api/admin/coupons | [list-coupons](admin/list-coupons.md) |
| admin | POST /api/admin/coupons | [create-coupon](admin/create-coupon.md) |
| admin | PUT /api/admin/coupons/:id | [update-coupon](admin/update-coupon.md) |
| admin | DELETE /api/admin/coupons/:id | [delete-coupon](admin/delete-coupon.md) |
| db | npm run seed | [seed](db/seed.md) |
