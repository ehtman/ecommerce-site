# src/docs/: OpenAPI (Swagger) spec

| File         | What it does                                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi.js` | The full OpenAPI 3 spec: info, `bearerAuth` security scheme, shared schemas (`Error`, `User`, `Address`, `Image`, `Category`, `AuthResult`, `Message`), shared error responses (incl. `NotFound`), the `/health` path, and every module's `tags` + `paths` merged in. |

Served by `app.js`:

- **http://localhost:5000/api/docs**: Swagger UI (try requests in the browser)
- **http://localhost:5000/api/docs.json**: raw spec (import into Postman/Bruno)

Adding a module: create `modules/<name>/<name>.docs.js` exporting `{ tags, paths }`, then spread it into `tags` and `paths` here. `tests/integration/app.test.js` checks that the routes are documented.

Concept: [12 – API design and docs](../../../docs/concepts/12-api-design-and-docs.md).
