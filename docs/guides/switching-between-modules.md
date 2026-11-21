# Switching between modules (git branches)

Every learning step in this repo is a **git branch**. The branches are *stacked*: each one
contains everything from the branch before it plus ONE new module.

```
main (01 auth)
 └─ 02-profile-addresses
     └─ 03-categories
         └─ 04-products-uploads
             └─ 05-cart-wishlist
                 └─ 06-coupons
                     └─ 07-orders
                         └─ 08-payments
                             └─ 09-reviews
                                 └─ 10-admin   ← the complete backend
```

| Branch | What it adds | New npm packages | New `.env` values |
|---|---|---|---|
| `main` | Register, login, JWT, roles, email verification, password reset, Google login | – | MONGO_URI, JWT_SECRET, SMTP_*, GOOGLE_CLIENT_ID |
| `02-profile-addresses` | Profile editing, saved delivery addresses | – | – |
| `03-categories` | Categories (public read, admin write), slugs | – | – |
| `04-products-uploads` | Products, search/filter/sort/pagination, image uploads | multer, cloudinary | CLOUDINARY_* (optional) |
| `05-cart-wishlist` | Cart and wishlist, server-side prices, sign-up transaction | – | – |
| `06-coupons` | Coupons and discount maths | – | – |
| `07-orders` | Checkout in one transaction, stock, order statuses, order emails | – | PAYMENT_CARD_ENABLED |
| `08-payments` | Stripe checkout, signed webhooks, unpaid-order expiry job | stripe | STRIPE_*, CRON_SECRET |
| `09-reviews` | Reviews after delivery, rating averages, moderation | – | – |
| `10-admin` | Dashboard, reports + CSV, customers, all `/api/admin/*` routes, full store seed | – | – |

## 1. See where you are and what exists
```bash
git branch            # all branches; the * marks the one you are on
git status            # are there unsaved (uncommitted) changes?
git log --oneline -10 # the last 10 commits on this branch
```
Ignore branches that start with `wip/`. Those were temporary build branches.

## 2. Switch to a module
```bash
git switch 04-products-uploads   # (older Git: git checkout 04-products-uploads)
cd server
npm install                      # ALWAYS after switching: packages differ between branches
npm test                         # all tests for this step (uses an in-memory DB, no setup needed)
npm run dev                      # run the API on http://localhost:5000/api (needs .env)
```
**Why `npm install` every time?** `package.json` changes between branches (for example
`stripe` only exists from `08-payments`). `node_modules` is not part of git, so it does not
switch automatically.

**Your `.env` stays the same on every branch.** It is not part of git. When you move to a
later branch, compare it with that branch's `.env.example` and add any new lines (see the
table above). Missing optional values just switch that feature off.

**Seeding data:** on `main` … `09-reviews` run `npm run seed:admin` (creates the admin).
On `10-admin` run `npm run seed` (admin + categories + 30 products + coupons).

## 3. "Git won't let me switch!"
Git refuses to switch when you have unsaved edits that would be overwritten. Choose one:
```bash
git restore .                  # throw my edits away (careful: cannot be undone)
# or keep them on a branch of your own:
git switch -c my-experiments
git add -A && git commit -m "my notes"
```

## 4. See exactly what one module added
Because branches are stacked, the difference between two neighbours is ONE module:
```bash
git diff 06-coupons..07-orders --stat     # which files changed
git diff 06-coupons..07-orders            # every changed line
git log --reverse --oneline 06-coupons..07-orders   # the commits, oldest first (build order)
git show <commit-id>                      # one commit in detail
```

## 5. Look at two modules side by side
A *worktree* is a second folder showing another branch, without switching your main folder:
```bash
git worktree add ../server-step-07 07-orders    # a new folder with branch 07
# …open both folders in your editor…
git worktree remove ../server-step-07           # when you are done
```

## 6. Postman / Bruno on older branches
The collection grows with each branch (one folder per module). On an older branch, the
collection file only contains the folders that exist up to that step, so re-import
`server/postman/ShopEase.postman_collection.json` after switching.

## 7. Go back to the newest version
```bash
git switch 10-admin
cd server && npm install
```

## 8. Suggested study loop for each module
1. `git switch <branch>` → `cd server` → `npm install` → `npm test`
2. Read `docs/mind-maps/<NN>-*.md` (how to think about it)
3. Read `docs/modules/<NN>-*.md` (what was built: endpoints, data model, flows)
4. `git log --reverse --oneline <previous>..<branch>` and read each commit with `git show`
5. `npm run dev`, open http://localhost:5000/api/docs and try the new endpoints
6. Do the exercises at the end of the module guide

## Using VS Code instead of commands
Click the branch name in the bottom-left corner of VS Code and pick a branch from the list.
Then open a terminal (`Ctrl+\``), `cd server`, and run `npm install`.

## 9. Working with the branches on GitHub

### Put the repo on GitHub (once)
1. **First** change the commit author if you need to: see `changing-commit-author.md` (do it BEFORE pushing).
2. On github.com click **New repository**, give it a name, leave it EMPTY (no README), click **Create**.
3. Connect your local repo and upload **every** branch:
```bash
git remote add origin https://github.com/<your-user>/<repo-name>.git
git push -u origin --all        # uploads ALL branches (main, 02-…, 03-… …)
```
`git push` alone would upload only the branch you are on, so `--all` matters here.
Optional: skip the temporary `wip/*` branches by deleting them from GitHub afterwards
(`git push origin --delete wip/<name>`). Your local copies stay.

### Switch branches on the GitHub website
- On the repo page, click the **branch button** (it says `main`, top-left above the file list) and pick a branch.
  GitHub now shows the files of that module.
- **Compare two modules:** open `https://github.com/<your-user>/<repo-name>/compare/06-coupons...07-orders`
  (or click *branches* → *Compare*). You see exactly what one module added, file by file.
- **Commits of a module:** pick the branch, then click **Commits** to read them in order.
- Make `main` the default branch (Settings → General → Default branch) so visitors start at step 1,
  or the last branch if you want visitors to see the finished app first.

### Get the branches on another computer
```bash
git clone https://github.com/<your-user>/<repo-name>.git
cd <repo-name>
git branch -a                   # shows remote branches as remotes/origin/07-orders etc.
git switch 07-orders            # Git creates the local branch from origin/07-orders automatically
```
You only need `git switch <name>`. You do NOT need to download each branch separately.

### Keep GitHub up to date after you change something
```bash
git switch 07-orders
# …edit, then commit…
git push                        # pushes this branch (it remembers origin after the first -u)
```
If you fix an early branch, merge it forward into the later branches (see `git-workflow.md`)
and push them all again with `git push --all`.
