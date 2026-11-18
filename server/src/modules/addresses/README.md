# src/modules/addresses/: a customer's delivery addresses

Mounted at **`/api/addresses`**. Every route needs `protect` + `authorize('customer')`. Admins get 403.

| File                    | What it does                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `address.model.js`      | The `Address` schema (owner `user`, label, fullName, phone, address lines, city, province, postalCode, country, isDefault). Indexes: `{user, createdAt}` and the **unique partial** `one_default_address_per_user`.                      |
| `address.validation.js` | `addressRules` for create and update: lengths, `REGEX.PK_PHONE`, `PROVINCES`, `ADDRESS_LABELS`, `REGEX.POSTAL_CODE`, optional boolean `isDefault`.                                                                                       |
| `address.service.js`    | `listAddresses`, `createAddress` (max 5, first = default), `updateAddress`, `deleteAddress` (newest takes over the default), `setDefault`. Private `makeDefault` runs in a **transaction**. Every query includes `user` (**ownership**). |
| `address.controller.js` | Thin handlers: `list`, `create` (201), `update`, `remove`, `setDefault` (returns the updated list).                                                                                                                                      |
| `address.routes.js`     | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/default` with `validateObjectId('id')` and `validate(addressRules)`.                                                                                                           |
| `address.docs.js`       | OpenAPI for `/addresses/*` (tag **Addresses**).                                                                                                                                                                                          |

Full guide: [docs/modules/02-profile-addresses.md](../../../../docs/modules/02-profile-addresses.md) · Mind map: [docs/mind-maps/02-profile-addresses.md](../../../../docs/mind-maps/02-profile-addresses.md) · Concept: [14 – Ownership and IDOR](../../../../docs/concepts/14-authorization-ownership.md)
Tests: `tests/integration/addresses.test.js`, `tests/unit/address.model.test.js`
