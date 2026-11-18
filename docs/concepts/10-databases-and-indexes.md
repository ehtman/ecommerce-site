# 10 – Databases and indexes

## MongoDB in one minute

MongoDB is a **document database**. It stores data as JSON-like documents grouped into **collections**.

| SQL world | MongoDB world | Here |
|---|---|---|
| database | database | `shopease` |
| table | collection | `users` |
| row | document | one user |
| column | field | `email`, `role`, … |
| primary key | `_id` (an **ObjectId**) | `665f1c2e9b1e8a0012345678` |

```json
{
  "_id": "665f1c2e9b1e8a0012345678",
  "name": "Ali Khan",
  "email": "ali@example.com",
  "role": "customer",
  "tokenVersion": 0,
  "createdAt": "2026-11-17T10:00:00.000Z"
}
```

## Mongoose: rules on top of MongoDB

MongoDB itself accepts any shape. **Mongoose** adds a **schema**: which fields exist, their types, and rules.

| Schema option | Meaning | Example in `user.model.js` |
|---|---|---|
| `type` | data type | `String`, `Date`, `Boolean`, `Number` |
| `required` | must be present (can be a function) | password required only for local accounts |
| `enum` | only these values | `role: ['customer','admin']` |
| `trim`, `lowercase` | clean the value before saving | email |
| `minlength`/`maxlength`/`match` | length and pattern checks | name 2–50, email regex |
| `default` | value when missing | `isActive: true` |
| `select: false` | not loaded unless asked for | `password`, token hashes |
| `timestamps: true` | auto `createdAt`/`updatedAt` | every user |

Mongoose also gives us:
- **hooks** (`pre('save')`): code that runs automatically, like hashing the password
- **methods** (`user.comparePassword()`): work on one document
- **statics** (`User.findByResetToken()`): work on the whole model
- **plugins** (`toJSON`): reusable behaviour for many schemas

## Indexes

Without an index, MongoDB reads **every** document to find a match (a "collection scan"). An **index** is a sorted lookup table, like the index at the back of a book.

| Index | Why |
|---|---|
| `email` **unique** | fast login lookup AND the database refuses duplicate emails |
| `googleId` **unique, sparse** | unique among users who *have* one; users without it are skipped |
| `role` | "find all admins" (used more in branch 10) |
| `emailVerifyTokenHash` sparse | fast verify-link lookup |
| `passwordResetTokenHash` sparse | fast reset-link lookup |
| addresses `{user, createdAt}` | "my addresses, newest first" (branch 02) |
| addresses `{user}` **unique, partial** (`isDefault: true`) | at most one default address per user (branch 02) |

**Unique indexes are the real guarantee.** The service checks `User.exists({ email })` first for a friendly message, but two requests at the same instant could both pass that check. The unique index makes the second insert fail (`E11000` → our error handler → 409).

**Partial indexes (branch 02).** A *partial* index only contains documents that match a filter. `{ user: 1 }` with `unique: true` and `partialFilterExpression: { isDefault: true }` means "among **default** addresses, each user appears once". Non-default addresses aren't in the index, so a user can have many of them. It turns the business rule "exactly one default" into something the database itself enforces. (`sparse` is the older, simpler cousin: it skips documents where the field is *missing*.)

**Cost of indexes:** they speed up reads but slow down writes a little and use space. Index what you search by often.

In development Mongoose builds indexes automatically (`autoIndex`). In production we run `npm run db:indexes` (`syncIndexes()`) on purpose.

## Connections

Opening a connection is slow, so we open **one** and reuse it. `connectDB()` caches it on `global`, which also works on serverless hosts like Vercel, where the same instance serves many requests. `maxPoolSize: 5` lets up to 5 queries run in parallel.

## Replica sets and transactions (preview of branch 07)

- A **replica set** = several MongoDB servers holding copies of the same data. If one dies, another takes over.
- A **transaction** = several writes that succeed **all together or not at all**. Example: create an order, reduce stock, empty the cart.
- First use, in branch 02: changing the default address = "unset the old default" + "set the new one". `address.service.js` wraps both in `mongoose.connection.transaction()`. If the second write finds nothing (wrong or foreign id), the first is rolled back.
- MongoDB transactions **only work on replica sets**. Atlas clusters are always replica sets, and our tests start an in-memory **1-member replica set** for the same reason.

> **Try it**
> In Atlas → Browse Collections, open `users` and look at a user: no `password`? It's there, but it's a bcrypt hash. Compare with `GET /api/auth/me`, where it's gone completely.

## Check yourself
1. Why is the unique index needed even though the service checks for duplicates?
2. What does `sparse` mean on `googleId`?
3. What does `select: false` do, and how do you override it?
4. Why do transactions need a replica set, and how do our tests provide one?

## In this repo
- `server/src/modules/users/user.model.js`, `server/src/modules/addresses/address.model.js`
- `server/src/config/db.js`, `server/src/db/scripts/syncIndexes.js`
- `server/tests/setup/globalSetup.js` (in-memory replica set)
