# src/config/: settings and connections

| File           | What it does                                                                                                                                                                                                   | Used by                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `env.js`       | The **only** reader of `process.env`. Loads `.env`, exits if `MONGO_URI`/`JWT_SECRET` are missing (fail fast), applies defaults, converts types, adds `isProduction`, `isTest`, `CLIENT_URLS`, `FRONTEND_URL`. | almost every file                  |
| `constants.js` | Frozen business constants: `ROLES`, `AUTH_PROVIDERS`, `TOKEN_TTL` (24 h verify / 30 min reset), `REGEX` (`EMAIL`, `PK_PHONE`, `POSTAL_CODE`), `PROVINCES`, `ADDRESS_LABELS`, `LIMITS.MAX_ADDRESSES`.           | models, middleware                 |
| `db.js`        | `connectDB()`: one cached Mongoose connection (works for local and serverless), `strictQuery`, pool size 5, `autoIndex` off in production.                                                                     | `server.js`, `api/index.js`, tests |

Concepts: [09 – Config and environments](../../../docs/concepts/09-config-and-environments.md), [10 – Databases and indexes](../../../docs/concepts/10-databases-and-indexes.md).
