// Metadata for the 10 Phase II views. `usedIn` lists the app features each view
// powers (shown on the Reports page). Only views listed here can be queried
// through the API (a whitelist, so view names are never taken from user input).
//
// scope:
//   'global' - catalog-level data, visible to every role (including Guest)
//   'user'   - has a user_id column; Users see only their own rows, Admins see all
//   'admin'  - Admin only
const fs = require('fs');
const path = require('path');
const { DATABASE_DIR } = require('../config/env');

const VIEWS = [
  { number: 1, name: 'v_meal_plan_details', usedIn: ["Meal Planner: week table and meal search", "Dashboard: today's meals", "Meal plan export (CSV/PDF)"],
    title: 'Meal Plan Details', requirement: 'Join of at least three tables', scope: 'user',
    description: 'Every planned meal with the user, the recipe, and its cost and calories per serving (MealPlans + Users + Recipes + RecipeIngredients + Ingredients).' },
  { number: 2, name: 'v_cheaper_swaps', usedIn: ["Meal Planner: 'Cheaper swap' on each planned meal (swap it in with one click)", "Grocery List: over-budget hint links to the swaps"],
    title: 'Cheaper Meal Swaps', requirement: 'Nested query with ANY + GROUP BY', scope: 'user',
    description: "For each user, recipes that cost less per serving than ANY meal they have planned from today on." },
  { number: 3, name: 'v_pantry_shortfalls', usedIn: ["Pantry: 'Running low for planned meals' table and 'Short' filter", "Dashboard: running-low warning"],
    title: 'Pantry Shortfalls', requirement: 'Correlated nested query', scope: 'user',
    description: "Pantry items with less stock than the same user's upcoming meal plans require." },
  { number: 4, name: 'v_ingredient_usage_overview', usedIn: ["Ingredients: 'Used in recipes' / 'Households' columns and Usage filter"],
    title: 'Ingredient Usage Overview', requirement: 'FULL JOIN', scope: 'global',
    description: 'Pantry stock vs. recipe usage per ingredient; shows stocked-but-unused and needed-but-unstocked ingredients.' },
  { number: 5, name: 'v_unplanned_pantry_items', usedIn: ["Pantry: 'Not used by your meal plan' table with links to recipes that use each item"],
    title: 'Pantry Items Not In Your Plan', requirement: 'Set operation (EXCEPT)', scope: 'user',
    description: "Ingredients each user has in stock EXCEPT those their upcoming meals will use - the items most likely to go to waste." },
  { number: 6, name: 'v_daily_nutrition_summary', usedIn: ["Dashboard: calories for the next 7 days chart"],
    title: 'Daily Nutrition Summary', requirement: 'Custom', scope: 'user',
    description: 'Calories and macronutrients per user per planned day, compared to their calorie target.' },
  { number: 7, name: 'v_grocery_list_budget_status', usedIn: ["Grocery List: 'My lists' table"],
    title: 'Grocery List Budget Status', requirement: 'Custom', scope: 'user',
    description: 'Each grocery list with item count, estimated total, remaining budget and purchase progress.' },
  { number: 8, name: 'v_pantry_value_by_category', usedIn: ["Pantry: 'Pantry by category' table"],
    title: 'Pantry Value by Category', requirement: 'Custom', scope: 'user',
    description: 'Estimated value of each user\'s pantry stock, grouped by ingredient category.' },
  { number: 9, name: 'v_recipe_nutrition_profile', usedIn: ["Dashboard: highest-protein recipes and light snack ideas", "Recipes export (CSV/PDF)"],
    title: 'Recipe Nutrition Profile', requirement: 'Custom', scope: 'global',
    description: 'Per-serving calories, macros and cost of each recipe, with a protein-per-dollar value score.' },
  { number: 10, name: 'v_user_activity_summary', usedIn: ["Admin: activity columns in the user table", "Dashboard: getting-started checklist"],
    title: 'User Activity Summary', requirement: 'Custom', scope: 'admin',
    description: 'Per-user counts of pantry items, meals in the next 7 days, active lists and authored recipes.' },
];

// Pulls each view's CREATE statement out of views.sql so the page can show the SQL.
let sqlCache = null;
function viewSql(name) {
  if (!sqlCache) {
    sqlCache = {};
    const text = fs.readFileSync(path.join(DATABASE_DIR, 'views.sql'), 'utf8');
    const re = /CREATE OR REPLACE VIEW (\w+) AS[\s\S]*?;/g;
    let m;
    while ((m = re.exec(text))) sqlCache[m[1]] = m[0].replace(/\r\n/g, '\n');
  }
  return sqlCache[name] || '';
}

const byName = (name) => VIEWS.find((v) => v.name === name || String(v.number) === String(name));

function canSee(view, role) {
  if (view.scope === 'admin') return role === 'Admin';
  if (view.scope === 'user') return role !== 'Guest';
  return true;
}

module.exports = { VIEWS, byName, viewSql, canSee };
