// Data for the dashboard. Each block is answered by one of the Phase II views.
const db = require('../config/db');
const { currentUser } = require('../middleware/auth');

const SNACK_MAX_KCAL = 300; // a recipe counts as a "light snack" at or below this

// Catalog rankings, visible to every role (including Guest).
async function overview(req, res) {
  const [topProtein, lightest, popular] = await Promise.all([
    // View 9: recipes ranked by protein per serving
    db.query(`SELECT recipe_id, title, protein_per_serving, calories_per_serving, cost_per_serving, protein_g_per_dollar
                FROM v_recipe_nutrition_profile
               ORDER BY protein_per_serving DESC LIMIT 6`),
    // View 9: light snack ideas = recipes of at most SNACK_MAX_KCAL per serving, lowest first
    db.query(`SELECT p.recipe_id, p.title, p.calories_per_serving, p.protein_per_serving, p.cost_per_serving, p.prep_time_mins
                FROM v_recipe_nutrition_profile p
               WHERE p.calories_per_serving <= $1
               ORDER BY p.calories_per_serving ASC, p.title LIMIT 10`, [SNACK_MAX_KCAL]),
    // Ingredients needed most often by everyone's planned meals
    db.query(`SELECT i.name, COUNT(*) AS times_planned
                FROM MealPlans mp
                JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
                JOIN Ingredients i ON i.ingredient_id = ri.ingredient_id
               GROUP BY i.name ORDER BY times_planned DESC, i.name LIMIT 8`),
  ]);
  res.json({ topProtein, lightest, snackMaxKcal: SNACK_MAX_KCAL, popularIngredients: popular });
}

// Personal dashboard for a logged-in User/Admin.
async function dashboard(req, res) {
  const userId = currentUser(req).user_id;
  const [profile, todayMeals, week, shortfalls, activity, lists] = await Promise.all([
    db.query('SELECT name, weekly_budget_limit, target_calories FROM Users WHERE user_id = $1', [userId]),
    // View 1: what is planned today
    db.query(`SELECT plan_id, meal_type, recipe_title, calories_per_serving, cost_per_serving
                FROM v_meal_plan_details WHERE user_id = $1 AND planned_date = CURRENT_DATE
               ORDER BY CASE meal_type WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Dinner' THEN 3 ELSE 4 END`, [userId]),
    // View 6: calories per day for the next 7 days (generate_series fills empty days)
    db.query(`SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(n.calories, 0) AS calories,
                     COALESCE(n.protein_g, 0) AS protein_g
                FROM generate_series(CURRENT_DATE, CURRENT_DATE + 6, INTERVAL '1 day') AS d(day)
                LEFT JOIN v_daily_nutrition_summary n ON n.planned_date = d.day::date AND n.user_id = $1
               ORDER BY d.day`, [userId]),
    // View 3: pantry items that will run out before the planned meals
    db.query(`SELECT ingredient_name, quantity_on_hand, quantity_needed, unit
                FROM v_pantry_shortfalls WHERE user_id = $1 ORDER BY ingredient_name`, [userId]),
    // View 10: drives the "getting started" checklist
    db.query('SELECT pantry_items, meals_next_7_days, active_lists, recipes_authored FROM v_user_activity_summary WHERE user_id = $1', [userId]),
    db.query('SELECT COUNT(*) AS n FROM GroceryLists WHERE user_id = $1', [userId]),
  ]);

  const target = profile[0].target_calories;
  const planned = todayMeals.reduce((s, m) => s + m.calories_per_serving, 0);
  const a = activity[0];
  res.json({
    profile: profile[0],
    today: { meals: todayMeals, planned_calories: planned, target_calories: target, remaining_calories: target ? target - planned : null },
    week,
    shortfalls,
    gettingStarted: [
      { key: 'targets', label: 'Set your weekly budget and daily calorie target', href: '/account', done: target !== null },
      { key: 'pantry', label: 'Add what is already in your pantry', href: '/pantry', done: a.pantry_items > 0 },
      { key: 'recipes', label: 'Add a recipe of your own (optional)', href: '/recipes', done: a.recipes_authored > 0 },
      { key: 'plan', label: 'Plan your meals for the next 7 days', href: '/planner', done: a.meals_next_7_days > 0 },
      { key: 'list', label: 'Generate a grocery list from your plan', href: '/grocery', done: lists[0].n > 0 },
    ],
  });
}

module.exports = { overview, dashboard };
