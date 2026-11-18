# Deploying the API to Vercel

The API runs on Vercel as a **serverless function**. `server/api/index.js` is the entry point, and `server/vercel.json` sends every URL to it:

```json
{ "version": 2, "rewrites": [{ "source": "/(.*)", "destination": "/api/index.js" }] }
```

`api/index.js` calls `connectDB()` (cached between requests) and passes the request to the same Express `app` used locally.

## Steps

1. Push the repo to GitHub (see [changing-commit-author.md](changing-commit-author.md) first).
2. Vercel → **Add New → Project** → import the repo.
3. **Root Directory: `server`**.
4. **Environment Variables**: add everything from `.env.example` with production values:
   - `NODE_ENV=production`
   - `MONGO_URI`: a **production** Atlas database (e.g. `/shopease_prod`)
   - `JWT_SECRET`: a new long random secret (not your dev one)
   - `CLIENT_URL`: the live frontend URL (comma-separate several)
   - `SMTP_*`, `EMAIL_FROM`: a real email provider (Mailpit is only for development)
   - `GOOGLE_CLIENT_ID` (optional), `ADMIN_*`
   - `RATE_LIMIT_ENABLED=true`
5. Atlas → Network Access: allow `0.0.0.0/0` (Vercel's IPs change).
6. Deploy.
7. Once, from your computer, with production values in a temporary `.env`:
   ```bash
   npm run db:indexes     # build indexes (autoIndex is off in production)
   npm run seed:admin     # create the admin
   ```
   Then remove the production secrets from your local `.env` again.
8. Check `https://<your-api>.vercel.app/api/health` → `"database":"connected"`.

## Notes
- Rate-limit counts are in memory, per serverless instance. That's fine for learning; production at scale would use Redis.
- Google login: add the live frontend URL to the OAuth client's **Authorized JavaScript origins**.
- Later branches add Stripe (webhook URL) and a cron job; their module docs explain the extra steps.
