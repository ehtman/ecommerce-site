# 12 – API design and documentation

## An API is a contract

Our **API** (Application Programming Interface) is a promise to every client: *"send me this, and I'll answer with that."* The frontend team builds on this promise. Breaking it breaks them.

## Naming URLs

| Good | Why |
|---|---|
| `/api/products`, `/api/products/:id` | plural nouns, ids in the path |
| `GET` to read, `POST` to create, `PUT`/`PATCH` to update, `DELETE` to remove | the method carries the action |
| `/api/auth/login`, `/api/auth/verify-email` | actions that aren't resources are fine as verbs |
| `/api/...` prefix | separates the API from other things (docs, health) |
| lower-case, kebab-case | `forgot-password`, not `forgotPassword` |

## One response envelope

```json
// success
{ "success": true,  "message": "Login successful", "data": { "token": "…", "user": { … } } }
// error
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "Email is invalid" } ] }
```

Every endpoint returns this shape (`sendSuccess` and `errorHandler`). Later, list endpoints will add `meta` for pagination.

## Status codes carry meaning

Clients decide what to do from the **status**: 401 → show login, 409 → "email taken", 429 → "wait a bit". See [01](01-how-the-web-works.md#status-codes).

## OpenAPI and Swagger UI

**OpenAPI** is the industry-standard file format that describes an API: paths, methods, request bodies, responses and security.

- Our spec lives in code: `src/docs/openapi.js` (shared parts) + one `<module>.docs.js` per module (`auth.docs.js`, `user.docs.js`, `address.docs.js`).
- **Swagger UI** turns it into an interactive page: **http://localhost:5000/api/docs**.
- The raw spec: **http://localhost:5000/api/docs.json**. Postman, Bruno and code generators can import it.
- A test (`app.test.js`) checks that every route is documented, so the docs can't silently fall behind.

Each module keeps its docs **next to its code**. A new module = one new `*.docs.js` file + one line in `openapi.js`.

> **Try it, in Swagger UI**
> 1. Open `/api/docs` → **Auth → POST /auth/login → Try it out**.
> 2. Log in as the seeded admin (`admin@shopease.pk` / `Admin12345`).
> 3. Copy `data.token`, click **Authorize** (top right), paste it.
> 4. Try **GET /auth/me**.

## Postman and Bruno

| Tool | What it is | In this repo |
|---|---|---|
| **Postman** | Popular GUI for calling APIs; collections can contain test scripts | `server/postman/` (collection + "local" environment) |
| **Newman** | Postman's command-line runner (for CI and quick checks) | `npm run test:api` |
| **Bruno** | Open-source, offline alternative; stores requests as plain text files in git | `server/bruno/`, `npm run test:bruno` |

Both collections run the **full auth story** (register → read the email from Mailpit → verify → login → reset → change password → admin login) and assert every status code.

## Versioning (for later)

When you must break the contract, version it (`/api/v2/...`) so old clients keep working. We don't need that yet.

## Check yourself
1. Why should every response have the same envelope?
2. What's the difference between OpenAPI and Swagger UI?
3. Why is there a test that checks the docs list every route?
4. When would you choose Bruno over Postman?

## In this repo
- `server/src/docs/openapi.js`, `server/src/modules/*/*.docs.js`
- `server/src/utils/ApiResponse.js`, `server/src/middleware/error.middleware.js`
- `server/postman/`, `server/bruno/`
