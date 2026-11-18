# Request flows

One diagram per endpoint / user action, showing exactly which files and functions a request
passes through: middleware, validation, controller, service, database, emails, external services,
every error exit (`ApiError` → `errorHandler`) and the final response.

Diagrams are Mermaid: GitHub and VS Code (with a Mermaid preview extension) draw them automatically.
This index grows with every branch. It lists the flows that exist up to **03-categories**.

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
