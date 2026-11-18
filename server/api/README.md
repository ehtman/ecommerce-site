# api/: Vercel serverless entry

| File       | What it does                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `index.js` | `handler(req, res)`: `await connectDB()` (cached between requests), then passes the request to the Express `app` from `src/app.js`. |

`../vercel.json` rewrites every URL to this file. Locally we use `src/server.js` instead. Both share the same `app`, which is why `app.js` never calls `listen()`.

Guide: [docs/guides/deployment-vercel.md](../../docs/guides/deployment-vercel.md)
