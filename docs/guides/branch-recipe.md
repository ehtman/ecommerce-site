# The branch recipe: how every module branch is built

Every learning step (branch) in this repo is built the same way. Once you know the recipe,
you can read any branch quickly, and later build your own modules the same way.

> **Stacked branches.** Each branch starts from the previous one, so it contains
> everything before it plus ONE new module. `git diff <previous>..<this>` shows exactly
> what the module added.

## 0. Start the branch
```bash
git checkout <previous-branch>
git checkout -b <NN-module-name>        # e.g. 03-categories
```

## 1. Think before coding (write the mind map first)
Create `docs/mind-maps/NN-<module>.md` following [00-how-to-think](../mind-maps/00-how-to-think.md):
requirements → data model → business rules (invariants) → endpoints & who may call them
→ validation → service logic → error cases → tests.

## 2. Build in layers (one commit per layer is ideal)
| Order | File | Rule of thumb |
|---|---|---|
| 1 | `src/config/constants.js` | New business numbers/enums go here, never inline |
| 2 | `src/modules/<m>/<m>.model.js` | Schema, indexes, hooks, methods. Add it to `src/modules/models.js` |
| 3 | `src/modules/<m>/<m>.validation.js` | express-validator rules for EVERY input |
| 4 | `src/modules/<m>/<m>.service.js` | Business logic. No `req`/`res`. Throws `ApiError` |
| 5 | `src/modules/<m>/<m>.controller.js` | Thin: read req → call service → `sendSuccess` |
| 6 | `src/modules/<m>/<m>.routes.js` | `protect` / `authorize` / limiter / `validate` → controller |
| 7 | `src/modules/<m>/<m>.docs.js` | OpenAPI paths + tags. Merge it in `src/docs/openapi.js` |
| 8 | `src/app.js` | One `app.use('/api/<m>', routes)` line |

Shared helpers that more than one module needs go in `src/utils/` (or `src/db/`), not inside a module.

## 3. Comment like a teacher
- Every file starts with a header block: **what** it is, **why** it exists, **where** it sits
  in the request flow, and **who uses it**.
- Comment each meaningful line with the *why* (not just the *what*).
- The first time a new engineering idea appears (transaction, slug, pagination…), explain
  it in one or two plain sentences and link the concept doc.

## 4. Test like a professional
- **Unit tests** (`tests/unit/`): pure logic such as model methods, helpers and pricing rules.
- **Integration tests** (`tests/integration/<m>.test.js`): EVERY route through Supertest:
  - happy path
  - 400 validation
  - 401 no/invalid token
  - 403 wrong role
  - 404 not found
  - 409 conflict
  - module-specific business rules and security cases
- Extend `tests/helpers/factories.js` with `create<Thing>()` helpers.
- **Regression rule:** never weaken or delete an earlier branch's tests. All must stay green.
- Coverage gate stays at ≥ 90% lines (`npm run test:coverage`).

## 5. Manual API tests
- **Postman:** add a folder `NN <Module>` to `server/postman/ShopEase.postman_collection.json`
  with test scripts. Add any new variables to the environment file.
- **Bruno:** add the same requests under `server/bruno/NN <Module>/`.
- Run both against a live server: `npm run test:api` and `npm run test:bruno`.

## 6. Document
| File | Content |
|---|---|
| `docs/modules/NN-<module>.md` | Endpoints table, data model diagram, flows, files map, exercises |
| `docs/mind-maps/NN-<module>.md` | The thinking (written in step 1, updated at the end) |
| `docs/concepts/*.md` | New ideas this module introduces (one file per idea) |
| Folder `README.md`s | A row for every new file |
| `README.md` (root) | Mark the branch ✅ in the roadmap |
| `CHANGELOG.md` | What this branch added |

## 7. The verification gate (all must pass before the branch is "done")
```bash
cd server
npm ci                 # clean install
npm run lint           # 0 errors
npm run format:check   # formatted
npm run test:coverage  # all tests green, coverage gate met
npm run dev            # /api/health → database: connected, /api/docs loads
npm run test:api       # Postman via Newman (Mailpit running, admin seeded)
npm run test:bruno     # Bruno CLI
```
Then commit in small steps (the Husky pre-commit hook runs lint and tests on every commit).
