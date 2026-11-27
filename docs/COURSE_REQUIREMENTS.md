# How NutriCart SmartPantry Meets the Course Requirements

Source: *SOFE 3700U Data Management Systems, Projects Information, Fall 2026*. Each requirement below is listed with the product feature that satisfies it.

Status key: **Done**

---

## Phase II: Project Design

| Part | Requirement | Status | Where |
|---|---|---|---|
| A | Relational schema with SQL `CREATE TABLE` commands | Done | `database/schema.sql` (8 Phase II tables) + `database/extensions.sql` (Phase III additions) |
| A | Graphical diagram of the relations | Done | Must include the Phase III additions: `Users.password_hash`, `Users.created_at`, `Ingredients.base_unit`, `Ingredients.off_product_code`, and the table `IngredientPriceHistory` (FK to Ingredients) |
| B | Sample data, at least 6 tuples per relation, suited to the views | Done | `database/seeders/seed.sql`: 7 users, 22 ingredients, 11 recipes, 41 recipe ingredients, 25 pantry items, 23 meal plans, 7 grocery lists, 18 list items, 7 price observations. Dates are relative to today so the views always return rows |
| C | 10 views with an English description and SQL | Done | `database/views.sql` (comment above each view). The Reports page shows the description and SQL too |
| D | E-R diagram | Done | Same additions as Part A |

### The 10 views and where each one is used in the app

All 10 are shown as tables on the **Reports** page, and each one is used in a real feature.

| # | View | Required type | How the SQL meets it | Used in the app |
|---|---|---|---|---|
| 1 | `v_meal_plan_details` | Join of at least 3 tables | MealPlans ⋈ Users ⋈ Recipes ⟕ RecipeIngredients ⟕ Ingredients | **Meal Planner** week table and meal search; **Dashboard** "Today" meals; meal-plan CSV/PDF export |
| 2 | `v_cheaper_swaps` | Nested query with ANY/ALL and GROUP BY | Users × Recipes, `GROUP BY` user and recipe, `HAVING cost_per_serving < ANY (SELECT cost per serving of that user's upcoming meals ... GROUP BY plan)` | **Meal Planner** *Cheaper swap* on every planned meal: cheaper recipes with similar calories, swapped in with one click. **Grocery List** over-budget hint points there |
| 3 | `v_pantry_shortfalls` | Correlated nested query | The subquery in `WHERE` (and `SELECT`) references the outer `p.user_id` and `p.ingredient_id` | **Pantry** "Running low for planned meals" table and the *Show: Running low* filter; **Dashboard** running-low box |
| 4 | `v_ingredient_usage_overview` | FULL JOIN | Pantry stock per ingredient `FULL JOIN` recipe usage per ingredient | **Ingredients** "Used in" and "Households" columns and the **Usage** filter (used / not used / needed but not stocked) |
| 5 | `v_unplanned_pantry_items` | Set operation (UNION/EXCEPT/INTERSECT) | (user, ingredient) pairs in the pantry `EXCEPT` pairs used by upcoming meals | **Pantry** "Not used by your meal plan" table, the food most likely to be wasted, with a link to recipes that use each item |
| 6 | `v_daily_nutrition_summary` | Custom | Calories and macros per user per day | **Dashboard** "Calories planned, next 7 days" chart |
| 7 | `v_grocery_list_budget_status` | Custom | Per-list totals, remaining budget, % bought | **Grocery List** "My lists" table |
| 8 | `v_pantry_value_by_category` | Custom | Pantry value per user per category | **Pantry** "Pantry by category" table |
| 9 | `v_recipe_nutrition_profile` | Custom | Per-serving calories, macros, cost, protein per dollar | **Dashboard** "Highest-protein recipes" chart and "Light snack ideas" ranking; recipes CSV/PDF export |
| 10 | `v_user_activity_summary` | Custom | Per-user counts via scalar subqueries | **Admin** user table activity columns; **Dashboard** getting-started checklist |

Code that reads each view: `backend/src/controllers/` (`mealPlanController`, `recipeController`, `pantryController`, `ingredientController`, `groceryListController`, `statsController`, `userController`, `viewController`) and `services/groceryService.js`. The list of which feature uses which view is also kept in `services/viewRegistry.js` (`usedIn`) and shown on the Reports page. The test *"every view powers a real feature outside the Reports page"* in `backend/test/api.test.js` checks this.

---

## Phase III: Backend

| # | Requirement | Status | How it's met | Where |
|---|---|---|---|---|
| 1 | Login/logout with session management | Done | Server-side sessions (httpOnly cookie). The session ID is replaced on login, and logout destroys the session. Passwords are salted scrypt hashes | `controllers/authController.js`, `app.js` |
| 1 | Roles (admin, user, guest) restricting functionality | Done | Every API route and page checks the role on the server. **Guest:** browse only. **User:** own data only. **Admin:** user management, editing the shared catalog, every user's data. Views are filtered by role too | `middleware/auth.js`, `routes/api.js`, `routes/pages.js`, `services/viewRegistry.js` |
| 2 | Input validation (email format, required fields, data types) | Done | Every write is validated on the server: required fields, email format, integer/decimal, real calendar dates, allowed values, min/max and length. The browser also checks forms and shows errors next to each field | `utils/validate.js`; `App.validateForm` in `frontend/public/js/common.js` |
| 3 | REST/JSON API with GET, POST, PUT, DELETE | Done | About 55 JSON endpoints | `routes/api.js` |
| 3 | External service integration that saves results in the database | Done | Open Food Facts (product search and nutrition) and Open Prices (prices). Importing creates an `Ingredients` row, and prices are stored in `IngredientPriceHistory` | `services/openFoodFacts.js`, `controllers/externalController.js` |
| 3 | Web service you implement (REST/JSON) | Done | The whole `/api` | `routes/api.js` |
| 3 | Web service that generates XML or JSON | Done | All endpoints return JSON. `GET /api/grocery-lists/:id/xml` returns XML | `services/xmlService.js` |
| 3 | Web service that interacts with the database | Done | Every `/api` endpoint | controllers |
| 3 | REST/JSON option: page using an external REST/JSON API with at least 2 queries tied to it | Done | The **Ingredients** page: search Open Food Facts, then import (`INSERT` Ingredients and `INSERT` IngredientPriceHistory), and refresh prices (`INSERT` IngredientPriceHistory and `UPDATE` Ingredients) | `frontend/public/js/ingredients.js` |
| 3 | *(Extra)* XML document with an XML Schema, and a page that reads it | Done | `grocery-list.xsd`; the **View as XML** page parses the XML with DOMParser | `frontend/public/schemas/grocery-list.xsd`, `frontend/public/js/xml-viewer.js` |
| 4 | Full CRUD on the data entities | Done | Users, Ingredients, Recipes (with ingredients), Pantry items, Meal plans, Grocery lists, List items | controllers |
| 5 | Export data to CSV and PDF | Done | Pantry, ingredients, recipes, meal plan, any grocery list, and any of the 10 views. pdfkit is used for PDF (the Node equivalent of the pandas example) | `services/exportService.js`, `controllers/exportController.js` |
| 6 | Error handling (database failures, wrong API input, exceptions) | Done | **Database down:** 503. **Validation:** 400 with field details. **Duplicates and constraints:** 409/400. **External API failures and timeouts:** 502. **Bad JSON:** 400. **Unknown routes:** 404. **Startup failures** print a clear message | `middleware/errorHandler.js`, `server.js` |

## Phase III: Frontend

| Requirement | Status | How it's met |
|---|---|---|
| Two or more web pages | Done | 11 pages: login, dashboard, pantry, recipes, meal planner, grocery list, ingredients, reports, account, admin, XML viewer |
| Pages execute the 10 views and show the results as HTML tables | Done | All 10 on Reports. Views 1, 2, 3, 4, 5, 7, 8 and 10 also appear as tables (or table columns) on the feature pages listed above. Views 6 and 9 also drive charts and the snack table |
| 1. Dynamic forms (validation, auto-fill suggestions) | Done | Ingredient autocomplete that fills in the unit; recipe form with add/remove ingredient rows and live calorie/cost totals; planner "Add" links that fill in date and meal; inline error messages |
| 2. AJAX / Fetch | Done | Every page loads and saves with `fetch()` and no page reloads (`App.api` in `common.js`) |
| 3. Data visualization (Chart.js / D3) | Done | Chart.js: calories for the week vs target (View 6), highest protein recipes (View 9), most planned ingredients, ingredient price history |
| 4. Search and filter (by date, category, keyword, id) | Done | Pantry (keyword, category, status), recipes (keyword, ingredient, prep time, cost, mine), meal plans (keyword, date range, meal type), ingredients (keyword, category, price, protein, usage), grocery lists (status), users (keyword, role). All filtering is done in SQL |
| README on installing and running (Windows or Linux) | Done | `README.md` covers Windows and Linux/macOS |

## Evaluation factors (from the info sheet) and where to find evidence

| Factor | Evidence |
|---|---|
| Choice and justification of architecture, technology, platform | `docs/IMPLEMENTATION_NOTES.md` section 1 |
| Bugs found and fixed; future enhancements | `docs/IMPLEMENTATION_NOTES.md` sections 7 and 8 |
| Appropriateness of the solution to the problem | `docs/USER_GUIDE.md`: the workflow matches the Phase I problem statement (reverse meal planning, net purchasing, budget, nutrition) |
| Interface design and usability | A plain, consistent layout. The menu follows the workflow order, the grocery page uses numbered steps, and new users get a checklist (implementation notes, section 5) |
| Quality of code (comments, modularity) | There is one controller per feature, shared services, comments on every file and on each view |
| Use of course technologies | SQL views, joins, nested/correlated queries, set operations, transactions, constraints, REST/JSON, XML + XSD, AJAX, sessions |
| What is new / creative | Grocery lists built from the meal plan minus the pantry; "Cooked" uses up stock; snack suggestions sized to today's remaining calories; cheaper meal swaps (an `ANY` subquery); flagging pantry food no meal will use, against waste (`EXCEPT`) |
