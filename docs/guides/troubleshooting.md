# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `❌ Missing required environment variables: MONGO_URI, JWT_SECRET` | No `server/.env`, or it's in the wrong folder | Run commands inside `server/`; copy `.env.example` to `.env` and fill both |
| `❌ MongoDB connection failed: … ENOTFOUND / timed out` | Your IP isn't allowed in Atlas, or no internet | Atlas → Network Access → add your current IP. See [setup-atlas](setup-atlas.md) |
| `bad auth : authentication failed` | Wrong DB user/password in `MONGO_URI` | Reset the DB user's password; URL-encode special characters |
| Data appears in a database named `test` | No database name in `MONGO_URI` | Add `/shopease` before the `?` |
| `EADDRINUSE: address already in use :::5000` | Another process uses port 5000 (an old `npm run dev`?) | Close it, or set `PORT=5001` in `.env`. Find it: PowerShell `Get-NetTCPConnection -LocalPort 5000` |
| No emails in http://localhost:8025 | Mailpit isn't running | `docker compose up -d` from the repo root; check `docker ps` |
| `failed to connect to the docker API … dockerDesktopLinuxEngine` | Docker Desktop isn't started | Start Docker Desktop, wait for "Engine running", retry |
| Postman/Newman: many `429 Too Many Requests` | Rate limits (10 auth tries / 15 min per IP) | Set `RATE_LIMIT_ENABLED=false` in `.env` and restart the API, or wait 15 min |
| Postman "Mailpit – read … email" fails | Mailpit down, or `mailpitUrl` wrong | Start Mailpit; environment `mailpitUrl = http://localhost:8025` |
| Postman "Admin login" fails with 401 | Admin not seeded, or different credentials | `npm run seed:admin`; match `adminEmail`/`adminPassword` with `.env` |
| `npm warn install-scripts … not yet covered by allowScripts` | npm 11 blocks install scripts by default | Safe to ignore for `@parcel/watcher` and `@scarf/scarf`. `bcrypt` and `mongodb-memory-server` are approved in `package.json` |
| `Cannot find module …bcrypt…` / bcrypt binding errors | bcrypt's install step was blocked or Node changed versions | `npm rebuild bcrypt`, or delete `node_modules` and `npm install` |
| First `npm test` is slow or seems stuck | mongodb-memory-server downloads MongoDB (~100 MB) once | Wait. Later runs are fast. Behind a proxy, set `HTTPS_PROXY` |
| `jest is not defined` in a test | ES modules: the `jest` object isn't global | `import { jest } from '@jest/globals'` |
| `SyntaxError: Cannot use import statement` running Jest | Ran `npx jest` without the ESM flag | Use `npm test` (it adds `--experimental-vm-modules`) |
| `git commit` is blocked | Husky pre-commit: lint or a test failed | Read the output, fix, commit again |
| `Seed: … already belongs to a CUSTOMER account` | `ADMIN_EMAIL` is used by a customer | Use another `ADMIN_EMAIL` |
| Swagger "Authorize" seems ignored | Token pasted with `Bearer ` prefix | Paste only the token; Swagger adds `Bearer` |
| `401 Password was changed, please log in again` | Your token is older than a password change | Log in again (that's the security feature working) |
