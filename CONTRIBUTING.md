# Contributing to NutriCart SmartPantry

This guide is for anyone changing the code. It covers how to get running, how the pieces fit together, where to make common changes, and the rules that keep the app working. For *using* the app, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

---

## 1. Get running (about 5 minutes)

You need **Node.js 18.17+** (`node -v`). No database install is needed.

```bash
git clone https://github.com/Pablothebuilder/Data-Management-Project.git
```

```bash
cd Data-Management-Project/backend
```

```bash
npm install
```

```bash
cp .env.example .env
```

(On Windows Command Prompt, use `copy .env.example .env`.)

```bash
npm run dev
```

Open <http://localhost:3000> and log in with a demo account, e.g. `sam@nutricart.test` / `User123!` (all demo accounts are in the README). `npm run dev` restarts the server whenever you save a backend file. For frontend files (HTML/CSS/JS), just refresh the browser.

The database is created automatically in `backend/.data/pglite/` on first start. That folder is your own local copy and is never committed.

### Everyday commands (run in `backend/`)

| Command | When to use it |
|---|---|
| `npm run dev` | While developing (auto-restart) |
| `npm start` | Run normally |
| `npm run db:reset` | After changing any `.sql` file, before a demo, or when your data is messed up. **Stop the server first.** It deletes your local database and rebuilds it from `database/*.sql` |
| `npm test` | Before every pull request. 14 API tests on a temporary database (your data is not touched) |
| `npm run check` | Before every pull request that touches `frontend/public/js`. Finds syntax errors (one error stops a whole page from working) |

---

## 2. How the app fits together

```
Browser                         Express server (backend/src)                PostgreSQL
-------                         ----------------------------                ----------
frontend/views/pantry.html  --> routes/pages.js (checks login/role, sends the HTML)
frontend/public/js/pantry.js
   App.api('/pantry')       --> routes/api.js  --> middleware/auth.js (login/role)
                                               --> controllers/pantryController.js
                                                     validate(req.body) (utils/validate.js)
                                                     db.query(SQL, params)  ---------> tables + views
                                               <-- JSON  { items: [...] }
   App.table(rows) renders it
errors anywhere ------------------------------> middleware/errorHandler.js --> { error: {status, message} }
```

- **Pages** are plain HTML files. Each has one script that fetches JSON from `/api/...` and builds the page. There is no template engine and no framework.
- **The API** is the only way data is read or written. Each feature has one controller file.
- **The database** is PostgreSQL. Locally this is the embedded engine (PGlite). Set `DATABASE_URL` in `.env` to use a real PostgreSQL server instead; nothing else changes.

---

## 3. Where things are

| Path | What it is | Edit it when... |
|---|---|---|
| `database/schema.sql` | Phase II tables. **Graded deliverable; do not edit** | Never. Put changes in `extensions.sql` |
| `database/extensions.sql` | Columns/tables/indexes added in Phase III | You need a new column or table |
| `database/views.sql` | The 10 views | You change a view's SQL |
| `database/seeders/seed.sql` | Sample data (demo accounts, recipes, plans...) | You need more or different demo data |
| `backend/src/server.js` | Starts the app: connect DB → build it if new → listen | Rarely |
| `backend/src/app.js` | Express setup: security headers, sessions, static files, routes | Adding middleware |
| `backend/src/config/env.js` | Reads settings from `backend/.env` | Adding a setting |
| `backend/src/config/db.js` | Database connection (`query`, `exec`, `transaction`) | Rarely |
| `backend/src/config/setup.js` | Runs the SQL files on first start / reset | Adding a new `.sql` file |
| `backend/src/routes/api.js` | **Every API endpoint and who may call it** | Adding an endpoint |
| `backend/src/routes/pages.js` | Every page URL and who may open it | Adding a page |
| `backend/src/controllers/*.js` | One file per feature (pantry, recipes, meal plans, grocery lists, ingredients, users, auth, views, dashboard stats, export, external API) | Changing what an endpoint does |
| `backend/src/services/groceryService.js` | Grocery list maths (needed - pantry) and completing a list | Changing list generation |
| `backend/src/services/openFoodFacts.js` | Calls to the external Open Food Facts / Open Prices APIs | Changing the external API |
| `backend/src/services/viewRegistry.js` | The list of the 10 views: title, required type, who can see it, **where it's used** | Adding/renaming a view or using one in a new place |
| `backend/src/services/exportService.js` | CSV and PDF generation | Changing export format |
| `backend/src/services/xmlService.js` | Grocery list XML document | Changing the XML (also update the `.xsd`) |
| `backend/src/middleware/auth.js` | Login/role checks (`requireWriter`, `requireAdmin`, `pageGuard`, `targetUserId`) | Changing permissions |
| `backend/src/middleware/errorHandler.js` | Turns errors into JSON responses | Mapping a new error type |
| `backend/src/utils/validate.js` | Input validation used by every write endpoint | Adding a validation rule type |
| `backend/test/api.test.js` | Automated tests | Adding a feature (add a test!) |
| `frontend/views/*.html` | Page layouts | Changing a page's structure or text |
| `frontend/public/js/common.js` | Shared helpers: `App.api`, `App.h`, `App.table`, `App.validateForm`, `App.modal`, `App.toast`, `App.ingredientPicker`, menu | Changing the menu, or something every page uses |
| `frontend/public/js/<page>.js` | That page's behaviour | Changing a page |
| `frontend/public/css/style.css` | The one stylesheet (plain on purpose) | Changing appearance |
| `frontend/public/schemas/grocery-list.xsd` | XML Schema for the grocery list XML | Changing the XML |

---

## 4. How to make common changes

### Add an API endpoint
1. Write the handler in the right controller. Use the existing pattern:
   ```js
   async function lowStock(req, res) {
     const userId = targetUserId(req);                 // the logged-in user's id (admins may pass ?userId=)
     const { limit } = validate(req.query, { limit: { type: 'int', min: 1, max: 100, default: 10 } });
     const rows = await db.query('SELECT ... WHERE user_id = $1 LIMIT $2', [userId, limit]);
     res.json({ items: rows });
   }
   ```
   Export it at the bottom of the file.
2. Register it in `routes/api.js` with a role guard: `router.get('/pantry/low', requireWriter, h(pantry.lowStock));`
   - `h(...)` sends errors to the error handler. Always wrap async handlers with it.
   - Put fixed paths like `/pantry/low` **above** `/pantry/:id`, or `:id` will catch them.
3. Add a test in `backend/test/api.test.js` and run `npm test`.

### Add a page
1. Copy an existing page, e.g. `frontend/views/account.html`, to `frontend/views/mypage.html`. Keep `<header id="app-nav">`, `common.js`, and your own script tag.
2. Create `frontend/public/js/mypage.js`, starting with:
   ```js
   (async () => {
     const { $, h, api, table, showError } = App;
     await App.init();                 // checks login and draws the menu
     try {
       const { items } = await api('/something');
       $('#content').replaceChildren(table(items));
     } catch (err) { showError(err); }
   })();
   ```
3. Add the URL in `backend/src/routes/pages.js`, e.g. `router.get('/mypage', pageGuard('User', 'Admin'), page('mypage.html'));`
4. Add it to the menu: the `NAV` list in `common.js`.
5. Run `npm run check`.

### Change or add a view
1. Edit `database/views.sql`. Keep the format `CREATE OR REPLACE VIEW name AS ... ;`, with **no `;` inside the view**: the Reports page pulls each view's SQL out of this file by that pattern. Keep the comment above it (the English description is a graded requirement).
2. Views are re-applied on every server start, so just restart. If you **removed or renamed columns**, run `npm run db:reset`, because `CREATE OR REPLACE VIEW` can't drop columns.
3. Update `backend/src/services/viewRegistry.js`: title, description, `scope` (who may see it), and `usedIn` (where the app uses it).
4. Every view must be used by a real feature, not only the Reports page. Update [docs/COURSE_REQUIREMENTS.md](docs/COURSE_REQUIREMENTS.md) if that changes.

### Change the database tables
1. Do **not** edit `schema.sql`. Add to `database/extensions.sql` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` or `CREATE TABLE IF NOT EXISTS ...`. This file runs on every start, so it must be safe to run twice.
2. Add sample rows to `seeders/seed.sql` if needed (every table needs 6+ rows for the course).
3. Run `npm run db:reset`.

### Change sample data
Edit `database/seeders/seed.sql`, then run `npm run db:reset`. Use `CURRENT_DATE + n` for dates so the demo always shows "this week". The tests depend on some seed values (e.g. Sam has 7 pantry items), so run `npm test` afterwards.

### Change permissions
Route-level permissions are in `routes/api.js` (`requireWriter` = User or Admin; `requireAdmin`) and `routes/pages.js` (`pageGuard(...)`). Data ownership is enforced in SQL with `WHERE user_id = $1`, using `targetUserId(req)`. Hiding a button in the HTML (`class="writer-only"` / `admin-only`) is only cosmetic. The server must also refuse the action.

---

## 5. Rules (please follow these)

- **SQL:** always pass values as parameters (`$1`, `$2`). Never build SQL by pasting user input into a string. Column names for sorting must come from a fixed list (see `SORTABLE` in the controllers).
- **Validation:** every write endpoint runs `validate(req.body, schema)` before touching the database. Bad input should return a 400 with a message, not a 500.
- **Errors:** `throw ApiError.badRequest('...')` / `notFound('Recipe')` / `forbidden()`. Don't write `res.status(...)` by hand for errors.
- **Multi-step writes** (e.g. create a list + its items) go in `db.transaction(async (tx) => { ... tx.query(...) })`. Inside a transaction, use `tx.query`, never `db.query`, or the embedded database will hang.
- **Frontend:** build elements with `App.h(...)` / `textContent`. Never set `innerHTML` with data (XSS). There are no inline `onclick="..."`; use `addEventListener` (the security policy blocks inline scripts).
- **Strings in JS:** watch out for apostrophes inside `'single quoted'` strings. Run `npm run check`.
- **Style:** keep the UI plain (tables, plain buttons). The grade is about the database and the views.
- **Comments:** every file starts with a comment saying what it is for. Keep that up to date.
- **Never commit:** `backend/.env`, `backend/.data/`, `node_modules/`. They are already in `.gitignore`.

---

## 6. Git workflow

1. Pull first: `git checkout main && git pull`
2. Branch: `git checkout -b yourname/short-description` (e.g. `ali/pantry-low-stock`)
3. Make the change, then run `npm test` and `npm run check` in `backend/`.
4. Commit with a clear message: what changed and why.
5. Push: `git push -u origin yourname/short-description`, then open a **pull request** on GitHub and fill in the template.
6. Someone will review and merge. Don't push straight to `main`.

If someone changed `.sql` files in a merge you pulled, run `npm run db:reset`.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| A page is blank or a section never loads | Open the browser dev tools (F12) → Console. A red syntax error means a JS file is broken; run `npm run check` |
| "Port 3000 is already in use" | Another server is running. Close it, or set `PORT=3001` in `backend/.env` |
| "The database files are damaged" / "no schema has been selected to create in" | Stop the server and run `npm run db:reset` |
| `db:reset` says files are in use | Stop the running server first (Ctrl+C) |
| A view change doesn't show up | Restart the server; if you removed/renamed a column, run `npm run db:reset` |
| Planner/dashboard look empty | Sample dates are relative to the day of the last reset. Run `npm run db:reset` |
| Open Food Facts search fails | Needs internet; the external service may be down. Everything else still works |
| Logged out after restarting the server | Expected: sessions are kept in memory. Set `SESSION_SECRET` in `.env` and log in again |

To inspect the data directly, use the **Reports** page, or run a quick query from `backend/`:

```bash
node -e "const {PGlite}=require('@electric-sql/pglite');(async()=>{const db=new PGlite('./.data/pglite');console.table((await db.query('SELECT * FROM v_pantry_shortfalls')).rows);await db.close()})()"
```

Stop the server before running this; the embedded database allows only one program at a time.
