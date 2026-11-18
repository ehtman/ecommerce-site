# MongoDB Atlas setup

Atlas is MongoDB's cloud service. The free **M0** cluster is enough for this project, and it's a **replica set**, so transactions work (needed in branch 07).

## 1. Create the cluster
1. Sign up at https://www.mongodb.com/cloud/atlas.
2. **Create** → **M0 (Free)** → pick a region close to you → **Create Deployment**.

## 2. Create a database user
**Security → Database Access → Add New Database User**
- Authentication: Password
- Username: e.g. `shopuser`, and a strong password (avoid `@ : / ? #`, or URL-encode them)
- Role: **Read and write to any database**

This is a *database* user, not your Atlas login.

## 3. Allow your IP address
**Security → Network Access → Add IP Address**
- **Add Current IP Address** (best), or
- `0.0.0.0/0` = anywhere (easy for learning and needed for Vercel, but less safe)

If your home IP changes, you must add the new one. That's the #1 cause of "connection failed".

## 4. Get the connection string
**Database → Connect → Drivers → Node.js** → copy:
```
mongodb+srv://shopuser:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
```
Edit it:
1. Replace `<password>` with the real password.
2. Add the **database name** before the `?`: `.../shopease?retryWrites=true&w=majority`

Put it in `server/.env` as `MONGO_URI=...`.

> Use a separate database name for production (e.g. `shopease_prod`), and never the same one you experiment with.

## 5. Check
```bash
npm run dev        # ✔ MongoDB connected
```
Atlas → **Browse Collections** → after registering you'll see the `users` collection.

## Common errors

| Message | Cause | Fix |
|---|---|---|
| `querySrv ENOTFOUND` / timeouts | IP not allowed, or no internet | Network Access → add your IP |
| `bad auth : authentication failed` | wrong DB user/password | reset the password in Database Access; URL-encode special characters |
| Data goes to a database called `test` | no database name in the URI | add `/shopease` before `?` |
| `MongoServerSelectionError` on office/VPN networks | port 27017 blocked | try another network or a hotspot |
