# NutriCart SmartPantry

NutriCart SmartPantry is a web app that helps a household plan meals, keep track of the food it already has, and shop on a budget. You record what's in your pantry, plan your meals for the week, and the app builds a grocery list of **only what you are missing** which takes into account your weekly budget. Your calorie targets and nutrition are tracked as well.

It is the term project for SOFE 3700U Data Management Systems (Group 13, Fall 2026) and the app runs on a PostgreSQL database.

| Document | What it covers |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | **For anyone editing the code:** setup, how the pieces fit together, where everything is, how to add an endpoint/page/view, rules, Git workflow |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | How to use the app, step by step (new user, pantry, recipes, meal plan, grocery list, snacks) |
| [docs/COURSE_REQUIREMENTS.md](docs/COURSE_REQUIREMENTS.md) | Every course requirement and the feature and file that satisfies it |
| [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md) | Design and technology decisions, bugs found and fixed, known limitations |

---

## What the app does

| Page | Purpose |
|---|---|
| **Dashboard** | Today's calories vs your target, light snack ideas that fit, items running low, calories for the week, highest protein recipes, most planned ingredients. New users see a getting started checklist |
| **Pantry** | Record what you have. See what will run out before your planned meals, what you have that **no planned meal uses** (so it doesn't go to waste), and what your pantry is made up of by category |
| **Recipes** | Browse and filter recipes with calories, protein and cost per serving. Add your own and plan them straight away |
| **Meal Planner** | A day by meal table for the next 7 days. *Cheaper swap* suggests cheaper recipes with similar calories. *Cooked* uses up pantry stock |
| **Grocery List** | Step 1: choose the days. Step 2: review needed minus pantry (over budget? it points you to cheaper swaps). Step 3: shop, tick items off, then complete the list to restock the pantry |
| **Ingredients** | The shared ingredient catalog, with how many recipes use each one. Import real products from Open Food Facts |
| **Reports** | All 10 views as tables with their SQL and where each is used in the app |
| **Admin** | User management with activity per user |

There are three roles. **User**s manage their own data, **Admin**s can also manage users and the shared catalog, and **Guest**s can browse recipes, ingredients and the catalog reports without an account.

## Technology

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS and plain JavaScript (Fetch/AJAX), with Chart.js for charts |
| Backend | Node.js 18.17+ and Express (REST/JSON API, sessions, PDF export with pdfkit) |
| Database | PostgreSQL. By default this is the embedded **PGlite** engine, so nothing extra needs installing. A regular PostgreSQL server also works |
| External APIs | Open Food Facts (product nutrition) and Open Prices (product prices). Both are free and need no key |

---

## Installing and running

### Prerequisites
- **Node.js 18.17 or newer** from <https://nodejs.org>. Check with `node -v`.
- Internet access for `npm install` and for the Open Food Facts import. Everything else works offline.

### Windows

```bash
cd "C:\path\to\Data Managment Project\backend"
```

```bash
npm install
```

```bash
copy .env.example .env
```

```bash
npm start
```

### Linux / macOS

```bash
cd "/path/to/Data Managment Project/backend"
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm start
```

Then open **<http://localhost:3000>**. On first start the database is created and filled with sample data automatically.

### Demo accounts (sample data)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@nutricart.test` | `Admin123!` |
| User | `sam@nutricart.test` (also `priya@`, `marcus@`, `jordan@`, `nina@`) | `User123!` |
| Guest account | `guest@nutricart.test` | `Guest123!` |

You can also click **Create account** to sign up as a new user, which is the best way to see the full workflow, or **Continue as guest** to browse.

### Commands (run inside `backend/`)

| Command | What it does |
|---|---|
| `npm start` | Start the app on port 3000 (or `PORT` from `.env`) |
| `npm run dev` | Start and restart automatically when files change |
| `npm run db:reset` | Delete and rebuild the database from the SQL files. Sample meal plans are dated relative to today |
| `npm test` | Run the 14 automated API tests on a temporary in-memory database |
| `npm run check` | Check every frontend script for syntax errors |

### Using a PostgreSQL server instead (optional)
1. Create a database, for example: `psql -U postgres -c "CREATE DATABASE nutricart;"`
2. In `backend/.env`, set `DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/nutricart`
3. Run `npm start`. The tables, views and sample data are created on first start. To load the SQL by hand instead, run in order: `database/schema.sql`, `extensions.sql`, `views.sql`, `seeders/seed.sql`.

### Settings (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `SESSION_SECRET` | random each run | Signs the login cookie. Set it so logins survive restarts |
| `DATABASE_URL` | empty | PostgreSQL server connection. Leave it empty to use the embedded database |
| `PGLITE_DATA_DIR` | `backend/.data/pglite` | Where the embedded database keeps its files |
| `OFF_USER_AGENT` | NutriCartSmartPantry/1.0 | Name sent to Open Food Facts, which asks clients to identify themselves |
| `EXTERNAL_TIMEOUT_MS` | `10000` | Time limit for Open Food Facts calls |

### Troubleshooting
- **"Port 3000 is already in use"**: set `PORT=3001` in `backend/.env`.
- **"Could not connect to the database"**: check `DATABASE_URL`, or delete it to use the embedded database.
- **"The database files are damaged" or "no schema has been selected to create in"**: stop the server and run `npm run db:reset`. This deletes and rebuilds the embedded database with the sample data.
- **`npm run db:reset` says the files are in use**: stop the running server first (Ctrl+C in its terminal).
- **Open Food Facts search fails**: the service is unreachable. The rest of the app keeps working.
- **Planner or dashboard looks empty**: run `npm run db:reset` to re-date the sample data to today.

---

## Project structure

```
backend/
  src/
    app.js, server.js      Express setup and entry point
    config/                settings, database connection (PostgreSQL or PGlite), database setup
    middleware/            login/role checks, error handling
    routes/                api.js (REST/JSON endpoints), pages.js (HTML pages)
    controllers/           one file per feature (auth, users, ingredients, recipes, pantry,
                           meal plans, grocery lists, views, dashboard stats, external API, export)
    services/              grocery list logic, Open Food Facts client, CSV/PDF export,
                           XML output, view registry
    utils/                 input validation, password hashing, error types
  test/api.test.js         automated tests
database/
  schema.sql               Phase II tables (unchanged)
  extensions.sql           columns and table added for Phase III
  views.sql                the 10 views
  seeders/seed.sql         sample data
frontend/
  views/*.html             one HTML file per page
  public/js/*.js           one script per page, plus common.js (shared helpers)
  public/css/style.css
  public/schemas/grocery-list.xsd
docs/                      user guide, requirements mapping, implementation notes
```

## REST API summary

Everything is under `/api` and uses JSON. All endpoints except the login ones need a logged-in session. Errors look like `{ "error": { "status", "message", "details" } }`.

| Area | Endpoints |
|---|---|
| Login | `POST /auth/login`, `/auth/register`, `/auth/guest`, `/auth/logout`, `GET /auth/me` |
| My account | `GET /users/me`, `PUT /users/me` |
| Users (Admin) | `GET /users`, `GET/PUT/DELETE /users/:id`, `POST /users` |
| Ingredients | `GET /ingredients?q=&category=&maxPrice=&minProtein=&usage=used\|unused\|unstocked&sort=`, `GET /ingredients/categories`, `GET /ingredients/:id`, `GET /ingredients/:id/prices`, `POST /ingredients`, `PUT/DELETE /ingredients/:id` (Admin) |
| Recipes | `GET /recipes?q=&ingredientId=&maxPrep=&maxCost=&mine=1&sort=`, `GET /recipes/:id`, `POST /recipes`, `PUT/DELETE /recipes/:id` (author or Admin) |
| Pantry | `GET /pantry?q=&category=&status=short\|empty&sort=`, `GET /pantry/shortfalls`, `GET /pantry/unplanned`, `GET /pantry/summary`, `POST /pantry`, `GET/PUT/DELETE /pantry/:id` |
| Meal plans | `GET /meal-plans?from=&to=&mealType=&q=`, `POST /meal-plans`, `GET/PUT/DELETE /meal-plans/:id`, `POST /meal-plans/:id/cook`, `GET /meal-plans/:id/swaps` |
| Grocery lists | `GET /grocery-lists?status=`, `GET /grocery-lists/preview?from=&to=`, `POST /grocery-lists/generate`, `GET/PUT/DELETE /grocery-lists/:id`, `POST /grocery-lists/:id/complete`, `POST/PUT/DELETE /grocery-lists/:id/items[/:itemId]`, `GET /grocery-lists/:id/xml` |
| Dashboard | `GET /stats/dashboard`, `GET /stats/overview` |
| Reports | `GET /views`, `GET /views/:name-or-number` |
| Export | `GET /export/:dataset?format=csv\|pdf` (pantry, ingredients, recipes, meal-plans, grocery-list&id=, or any view) |
| Open Food Facts | `GET /external/products?q=`, `POST /external/import`, `POST /external/prices/:ingredientId` |

## Team workflow

Track tasks and bugs in GitHub Issues. Use a branch per change and a pull request reviewed by a teammate. Never commit `.env`, `node_modules/` or `backend/.data/`. The full workflow is in [CONTRIBUTING.md](CONTRIBUTING.md#6-git-workflow).

## License

This is a private academic project. See `LICENSE`.
