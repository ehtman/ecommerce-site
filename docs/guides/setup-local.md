# Local setup (Windows first)

Commands are shown for **PowerShell** and **Git Bash** where they differ. macOS/Linux users: use the Git Bash versions.

## 1. Install the tools

| Tool | Why | Get it | Check |
|---|---|---|---|
| **Node.js 20+** (22 LTS recommended) | runs the API | https://nodejs.org | `node -v` |
| **Git** | version control | https://git-scm.com | `git --version` |
| **Docker Desktop** | runs Mailpit | https://www.docker.com/products/docker-desktop | `docker --version` |
| VS Code (optional) | editor | https://code.visualstudio.com | |
| Postman and/or Bruno (optional) | click through the API | postman.com / usebruno.com | |

After installing Docker Desktop, **start it** (whale icon in the system tray) and wait until it says "Engine running".

## 2. Get a MongoDB Atlas connection string

Follow [setup-atlas.md](setup-atlas.md). You'll end up with something like:
```
mongodb+srv://shopuser:YOURPASS@cluster0.abcde.mongodb.net/shopease?retryWrites=true&w=majority
```

## 3. Start Mailpit (fake email inbox)

From the **repo root** (where `docker-compose.yml` is):
```bash
docker compose up -d
```
Open http://localhost:8025. Every email the API sends shows up here.

## 4. Install the API

```bash
cd server
npm install
```

You may see `npm warn install-scripts … @parcel/watcher … @scarf/scarf`. That's fine. The two scripts we need (`bcrypt`, `mongodb-memory-server`) are already approved in `package.json → allowScripts`.

## 5. Create `.env`

PowerShell:
```powershell
Copy-Item .env.example .env
```
Git Bash:
```bash
cp .env.example .env
```

Edit `server/.env`:
- `MONGO_URI`: your Atlas string (with `/shopease` before the `?`)
- `JWT_SECRET`: generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- Optional while practising with Postman: `RATE_LIMIT_ENABLED=false`

## 6. Create the admin and start

```bash
npm run seed            # admin, categories, 30 products, coupons (safe to run twice)
# npm run seed:admin    # (only the admin: ✔ Admin created: admin@shopease.pk)
npm run dev             # ✔ MongoDB connected / ✔ API running on http://localhost:5000/api
```

## 7. Verify checklist

- [ ] http://localhost:5000/api/health shows `"database":"connected"`
- [ ] http://localhost:5000/api/docs opens Swagger UI
- [ ] Register via Swagger → an email appears in http://localhost:8025
- [ ] `npm test` → all tests pass (no Atlas or Mailpit needed)
- [ ] `npm run lint` → no errors
- [ ] `npm run test:api` → all Postman assertions pass

## 8. Daily routine

```bash
docker compose up -d     # if Mailpit isn't running
cd server
npm run dev
```

Stop the API with **Ctrl + C**. Stop Mailpit with `docker compose down`.

Problems? See [troubleshooting.md](troubleshooting.md).
