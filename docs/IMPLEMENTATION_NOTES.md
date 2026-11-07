# Implementation Notes

This is a log of the technical decisions made while building NutriCart SmartPantry, with the reasoning for each. It is source material for the final report sections on architecture, bugs found and fixed, and future work.

- The requirement-by-requirement mapping is in [COURSE_REQUIREMENTS.md](COURSE_REQUIREMENTS.md).
- How to use the app is in [USER_GUIDE.md](USER_GUIDE.md).

*Initial implementation: Nov 7, 2026. Revision 2 (same day): plain UI, all views in real features, workflow redesign, new dashboard.*

---

## 1. Architecture and technology

### 1.1 Three-tier web application
Browser (HTML/CSS/JS) → Node.js/Express (REST/JSON API and page server) → PostgreSQL. This matches the Phase I proposal. The backend uses the folder layout that was already in the repo: `config`, `controllers`, `middleware`, `routes`, `services`.

### 1.2 Node.js and Express
The proposal allowed "Node.js or Python". Node was chosen because:
- One language runs on both client and server.
- Express maps directly onto the REST verbs the course asks for.
- Node 18+ has `fetch` built in, so the external API needs no extra library.

### 1.3 PostgreSQL instead of MySQL
The proposal said MySQL, but the team's Phase II `schema.sql` uses PostgreSQL syntax. More importantly, **View 4 must use `FULL JOIN`, which MySQL does not have**, and `EXCEPT` (View 5) only arrived in MySQL 8.0.31. The app also uses PostgreSQL features: `generate_series`, `ILIKE`, `IS NOT DISTINCT FROM`, and `ON CONFLICT DO UPDATE`.

### 1.4 Embedded PostgreSQL by default, with a real server optional
`backend/src/config/db.js` hides two drivers behind one small interface (`query`, `exec`, `transaction`):
- **PGlite** (default) is the real PostgreSQL engine compiled to WebAssembly. Nothing needs installing, and the data lives in `backend/.data/pglite`. Anyone can run `npm install && npm start` on Windows or Linux.
- **node-postgres** is used when `DATABASE_URL` is set, for a normal PostgreSQL server (useful for pgAdmin screenshots).

Both drivers return the same types: `NUMERIC` and `BIGINT` as numbers, and `DATE` as a `'YYYY-MM-DD'` string so there are no timezone shifts. PGlite has a single connection, so the adapter runs its queries one at a time.

### 1.5 The database sets itself up
On start, the server first checks that the `public` schema is usable, then whether the `users` table exists. If the table is missing, it runs `schema.sql`, `extensions.sql`, `views.sql` and `seed.sql`. `extensions.sql` and `views.sql` are re-applied on every start (both are written to be re-run safely), so edits to views take effect after a restart.

`npm run db:reset` rebuilds everything:
- **Embedded database:** it **deletes the data folder** and builds a new one. It does not drop and re-create the `public` schema, because that can damage PGlite's stored catalog (bug 10).
- **PostgreSQL server:** it drops and re-creates the `public` schema.

### 1.6 Static HTML pages and a JSON API
Each page is a plain HTML file (`frontend/views`) with one script (`frontend/public/js`) that talks to the API with `fetch`. This keeps web pages and web services separate, as the course asks, and every feature goes through the same API the tests use. The server still checks login and role before it sends a page.

### 1.7 Plain JavaScript, no framework; Chart.js served locally
A small helper file (`common.js`) provides `api()`, an element builder, `table()`, form validation, a dialog and messages. Data is always inserted as text, never as HTML, which prevents XSS. Chart.js is served from `node_modules`, so charts work offline and the Content-Security-Policy can allow only same-origin scripts.

---

## 2. Database decisions

### 2.1 The Phase II schema is untouched; additions are in `extensions.sql`
| Addition | Reason |
|---|---|
| `Users.password_hash`, `Users.created_at` | Login needs credentials; the admin page shows the join date |
| `Ingredients.base_unit` | The schema stores price and calories "per unit" without saying what the unit is. With a fixed unit per ingredient, quantities can be added up and compared |
| `Ingredients.off_product_code` | Links an imported ingredient to its Open Food Facts product so prices can be refreshed |
| `IngredientPriceHistory` table | Stores the price observations fetched from the external API (the "save results into your database" requirement) |
| Indexes | On the columns used for search, filtering and joins |

The relational and ER diagrams must show these additions.

### 2.2 One unit per ingredient, no conversions
Pantry, recipe and list quantities for an ingredient all use its `base_unit`. Forms fill the unit in and make it read-only, so units cannot be mixed. Unit conversion (cups ↔ grams) is future work.

### 2.3 Countable units are rounded up when buying
`to buy = needed - in pantry`. For `each`, `slice`, `clove`, `can`, `unit` and `pack` it is rounded up to a whole number (you cannot buy half an onion). Other units round up to 2 decimals.

### 2.4 Sample data is dated relative to today
Meal plans use `CURRENT_DATE + n`, so the views and dashboard always have current data after seeding. Revision 2 added four light snack recipes (Hard-Boiled Eggs, Handful of Almonds, Greek Yogurt & Banana, Spinach Banana Smoothie) so the snack feature has something to suggest.

### 2.5 Notes on individual views
- **View 1** uses LEFT JOINs for RecipeIngredients and Ingredients, so a meal is still listed if its recipe lost all its ingredients (bug 4).
- **View 2** compares each recipe's cost against `ALL` *User*-role daily budgets (weekly budget ÷ 7).
- **View 3** uses the correlated subquery in both `WHERE` and `SELECT`.
- **View 4** FULL JOINs two aggregates. Since Almonds is now used by a recipe, *Quinoa* (stocked, not used) and *Greek Yogurt* (used, nobody stocks it) are the examples for the two unmatched sides.
- **View 10** is admin-only because it shows every user's email.

---

## 3. Every view drives a real feature (revision 2)

Revision 1 used views 2, 4 and 5 only on the Reports page, and view 3 only as a count. That met the letter of the requirement, but not its intent. In revision 2, every view feeds part of the app. The full list is in [COURSE_REQUIREMENTS.md](COURSE_REQUIREMENTS.md#the-10-views-and-where-each-one-is-used-in-the-app).

How the views are read:
- The backend queries a view directly when the view already has the right shape. For example, the "My lists" table is `SELECT ... FROM v_grocery_list_budget_status WHERE user_id = $1`.
- When a feature needs a **yes/no answer** from a view, it uses `EXISTS` or `IN` against the view:
  - `budget_friendly` on recipes (View 2)
  - the pantry "running low" filter (View 3)
  - `not_in_pantry` on the grocery preview (View 5)
- The Ingredients list **LEFT JOINs** View 4, so ingredients that neither side of the FULL JOIN includes still appear, labelled "Not used or stocked".
- `services/viewRegistry.js` records `usedIn` for each view. The Reports page shows it, and a test checks that every view has at least one use.

---

## 4. Security and roles

| Decision | Detail |
|---|---|
| Sessions | `express-session`. The cookie is httpOnly, `sameSite=lax`, with a 2-hour rolling expiry. The session ID is replaced on login |
| Session store | In memory. Fine for one server; logins are lost on restart |
| Passwords | Node's built-in `crypto.scrypt` with a random salt and a constant-time comparison. No native build tools are needed on Windows |
| Login errors | The same message for an unknown email and a wrong password |
| Registration | Always creates a `User`. Only an Admin can grant roles |
| Guest | A session with no user ID. Read-only. Personal endpoints return 403 |
| Data isolation | Personal queries always filter by the session's `user_id`. Another user's IDs return 404. Admins may use `?userId=` |
| SQL injection | Every value is a `$n` parameter. Sort columns come from fixed lists, and view names from a fixed list |
| XSS / CSP | Data is inserted as text only. The Content-Security-Policy allows only same-origin scripts |
| CSV injection | Cells starting with `= + - @` get a `'` prefix |
| CSRF | Partly covered by `sameSite=lax` cookies and JSON request bodies. Tokens are future work |

---

## 5. User interface and workflow (revision 2)

### 5.1 Plain design
The first design looked like a commercial product (rounded cards, shadows, gradients, coloured pills, emoji). The course grades the database and the views, not the visual design. A UI a student team would plausibly build is also more honest and easier to maintain. So the stylesheet was rewritten:
- Arial; white background; 1px grey borders.
- Square buttons; data in ordinary bordered tables.
- Labels are plain text, and one dark green is used for links and buttons.

All pages still work on a phone.

### 5.2 Workflow changes
Each change came from walking through the target scenario: *a new user stocks the pantry, adds a few of their own recipes, plans the week, generates a grocery list, and later adds a light snack within their calorie goal.*

| Problem | Change |
|---|---|
| A new user landed on a dashboard of zeros, with no idea where to start | A **Getting started** checklist (built from View 10) links to each step in order and disappears when done |
| No way to change your budget or calorie target after signing up | New **Account** page |
| The menu order didn't match the workflow | The menu is now Dashboard → Pantry → Recipes → Meal Planner → Grocery List → Ingredients → Reports |
| It wasn't clear how the pantry changes over time | A note on the Pantry page explains the three ways it updates (edit, complete a list, cook a meal) |
| After creating a recipe you had to go somewhere else to plan it | Saving a new recipe immediately offers "add it to your meal plan" |
| The week grid made it unclear which meal slot was free | The planner is a **day × meal table** with an **Add** link in every cell that fills in date and meal |
| The grocery page mixed "preview", "generate" and "empty list" buttons | Three numbered steps. The preview loads automatically and refreshes when the dates change. The create button is under the preview. "Empty list" was removed |
| Shopping and restocking weren't connected | Step 3 explains: tick items as you buy them, then **Complete list** to restock the pantry |

### 5.3 Dashboard contents
**Removed:**
- The count tiles (pantry items, active lists, meals next 7 days, number of users).
- The pantry-value pie chart, now a table on the Pantry page.
- The list-spending chart, which repeated the Grocery List page.

None of these helped a user decide anything.

**Added or kept:**
- **Today**: planned vs target calories and what is left (Views 1 and 6).
- **Light snack ideas**: recipes of **≤ 300 kcal per serving**, lowest first (View 9), with a *budget-friendly* label (View 2), a "Fits today?" column, and an **Add as snack today** button. 300 kcal was chosen as a typical snack size. Without a cap, full meals filled the list (bug 8). The cap is `SNACK_MAX_KCAL` in `statsController.js`.
- **Running low for planned meals** (View 3).
- **Calories planned, next 7 days** chart (View 6).
- **Highest-protein recipes** (View 9) and **most-planned ingredients** charts. Both were kept because the user found them useful.

---

## 6. Business rules

- **Generate grocery list:** add up the ingredients of the meals in the date range, subtract pantry stock, and keep only positive amounts. Prices are copied from the catalog at that moment. The budget defaults to the user's weekly budget. Runs in one transaction.
- **Grocery list states:** `Active ↔ Archived`. **Complete** is the only way to reach `Completed`. It adds the ticked items to the pantry and is final, so purchases can't be added twice. Items can only change while a list is Active.
- **Add to pantry:** if the ingredient is already there, the quantity is added to it (`ON CONFLICT DO UPDATE`).
- **Cooked:** subtracts the recipe from the pantry (never below 0) and removes the meal from the plan, in one transaction.
- **In pantry %:** the share of a recipe's ingredients the user has enough of. It powers the "Most ingredients in my pantry" sort.

---

## 7. External API (Open Food Facts)

- **Why it was chosen:** it is free, needs no key (nothing secret to commit), and its sister project Open Prices supplies prices. That covers both the nutrition and pricing sources named in the proposal.
- **Endpoints:**
  - search: `search.openfoodfacts.org/search` (the older `cgi/search.pl` returned HTTP 503 during development)
  - product: `world.openfoodfacts.org/api/v2/product/{barcode}.json`
  - prices: `prices.openfoodfacts.org/api/v1/prices`
- **Imported products** use the unit `100g`, so the nutrition values per 100 g are stored as-is. Categories are guessed from Open Food Facts category tags, and the user can change them before saving.
- **Price estimate:** the median observation, converted to per-100g and then to CAD using a **fixed approximate exchange-rate table**, since most Open Prices data is in EUR. With no usable price, the user enters one, or it defaults to $0.00.
- **Price refresh** only changes the stored price when the ingredient's unit can be converted (`100g`, `100ml`, `kg`, `L`). Duplicate observations are skipped.
- **Reliability:** every call has a timeout and an identifying User-Agent. Failures become a 502 with a readable message. If the price lookup fails during an import, the import still succeeds with a warning.

---

## 8. Bugs found and fixed

1. **Reports showed some numbers as dollars.** Any column containing "total" was formatted as money, so `total_on_hand` showed as "$5.00". Now only columns ending in total/value, or containing price/cost/budget, are formatted as money.
2. **The ingredient autocomplete accepted unknown names.** The form validator cleared the picker's "choose from the suggestions" error. It now only resets fields that have their own custom rule.
3. **Purchases could be added to the pantry twice.** A completed list could be re-opened and completed again. Completed is now final, and items can only change on Active lists.
4. **View 1 hid meals whose recipe had no ingredients.** It was an inner join. Changed to LEFT JOIN with COALESCE.
5. **`npm test` failed on Windows.** `node --test test/` was treated as a module path. The script now names the file.
6. **The Recipes page showed no recipes.** An apostrophe inside a single-quoted JavaScript string ("ingredient's") caused a syntax error that stopped the whole script. It was found in the browser console during the walkthrough, fixed by rewording, and every script was then checked with `node --check`.
7. **Duplicate grocery lists were possible.** After creating a list, the "Create grocery list" button stayed under the preview. It is now replaced by a "list created" message.
8. **"Snack ideas" included full meals.** The lowest-calorie ranking also listed 500+ kcal dinners. It is now capped at 300 kcal per serving.
9. **A misleading dashboard message.** "Your pantry covers all of your planned meals" appeared for a new user with an empty pantry, because View 3 only covers items you have. The text now says nothing is running low, and points to the Grocery List page for items you don't have at all.
10. **`npm start` failed with "no schema has been selected to create in"** (reported by a teammate). The old `npm run db:reset` ran `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`. With the embedded engine (PGlite), this sometimes left the saved database inconsistent:
    - `pg_namespace` still had a `public` row, but the schema could not be found by name (`current_schemas()` returned only `pg_catalog`).
    - The next start therefore found no tables, tried to create them, and failed.

    It didn't happen every time, which is why earlier resets worked.

    Fixes:
    - For the embedded database, the reset now deletes the data folder and builds a fresh one.
    - On start, the server checks that `public` is usable. If it isn't, it stops with a clear message saying to run `npm run db:reset`, instead of a long stack trace.

    Verified with three reset cycles of two restarts each, a first start with no data folder, and a restart after force-killing the server.

---

## 9. Testing

`npm test` runs **14** end-to-end API tests against a fresh in-memory database. They cover:
- login, registration and roles;
- all 10 views returning rows;
- the use of each view in its feature (budget filter, shortfalls, usage filter, not-in-pantry flag, pantry by category, admin activity);
- CRUD for pantry, recipes and meal plans;
- grocery list generation and completion;
- XML, CSV and PDF output;
- error handling;
- the dashboard (today's calories, snack ranking, the getting-started checklist for a brand-new user).

**Manual testing on Nov 7, 2026:**
- The external API: search, import, and a price refresh that found 20 observations.
- The full new-user workflow in a browser: create an account → add pantry items → create a recipe and plan it from the prompt → plan meals in the planner table → review and create a grocery list → add a snack from the dashboard.
- Bugs 6–9 were found during this walkthrough.

---

## 10. Known limitations and future work

- No unit conversion between ingredient units.
- Fixed exchange rates for foreign prices.
- Sessions are stored in memory, so logins are lost on restart.
- No CSRF tokens, no limit on login attempts, and no password reset by email.
- Grocery lists count the whole recipe for every planned meal. Recipes are not scaled to the number of people eating.
- There is no explicit "snack" type on recipes. Snacks are defined by calories (≤ 300 kcal), so a light side dish also counts.
- Prices are only refreshed when someone asks. A scheduled job could keep them current.
