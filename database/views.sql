-- =====================================================================
-- NutriCart SmartPantry - Phase II Part C: 10 views
-- Views 1-5 satisfy the course-mandated query types; views 6-10 are
-- application-specific. Every view is displayed on the /views page.
-- =====================================================================

-- ---------------------------------------------------------------------
-- View 1 (join of at least three tables)
-- Meal plan details: every planned meal with the user who planned it,
-- the recipe, and the recipe's cost and calories per serving. Joins
-- MealPlans, Users, Recipes, RecipeIngredients and Ingredients (LEFT JOIN
-- for the last two so a recipe with no ingredients still appears).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_meal_plan_details AS
SELECT mp.plan_id,
       u.user_id,
       u.name AS user_name,
       mp.planned_date,
       mp.meal_type,
       r.recipe_id,
       r.title AS recipe_title,
       r.prep_time_mins,
       r.servings,
       COALESCE(ROUND(SUM(ri.required_quantity * i.estimated_unit_price) / COALESCE(NULLIF(r.servings, 0), 1), 2), 0) AS cost_per_serving,
       COALESCE(ROUND(SUM(ri.required_quantity * i.calories_per_unit) / COALESCE(NULLIF(r.servings, 0), 1), 0), 0) AS calories_per_serving
FROM MealPlans mp
JOIN Users u                   ON u.user_id = mp.user_id
JOIN Recipes r                 ON r.recipe_id = mp.recipe_id
LEFT JOIN RecipeIngredients ri ON ri.recipe_id = r.recipe_id
LEFT JOIN Ingredients i        ON i.ingredient_id = ri.ingredient_id
GROUP BY mp.plan_id, u.user_id, u.name, mp.planned_date, mp.meal_type,
         r.recipe_id, r.title, r.prep_time_mins, r.servings;

-- ---------------------------------------------------------------------
-- View 2 (nested query with ANY/ALL + GROUP BY)
-- Budget-friendly recipes: recipes whose total ingredient cost is no
-- more than the daily budget (weekly budget / 7) of ALL regular users,
-- i.e. a recipe that any user could afford in a single day.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_budget_friendly_recipes AS
SELECT r.recipe_id,
       r.title,
       r.servings,
       COUNT(ri.ingredient_id) AS ingredient_count,
       ROUND(SUM(ri.required_quantity * i.estimated_unit_price), 2) AS total_cost,
       ROUND(SUM(ri.required_quantity * i.estimated_unit_price) / COALESCE(NULLIF(r.servings, 0), 1), 2) AS cost_per_serving
FROM Recipes r
JOIN RecipeIngredients ri ON ri.recipe_id = r.recipe_id
JOIN Ingredients i        ON i.ingredient_id = ri.ingredient_id
GROUP BY r.recipe_id, r.title, r.servings
HAVING SUM(ri.required_quantity * i.estimated_unit_price) <= ALL (
    SELECT u.weekly_budget_limit / 7.0
    FROM Users u
    WHERE u.role = 'User'
);

-- ---------------------------------------------------------------------
-- View 3 (correlated nested query)
-- Pantry shortfalls: pantry items whose quantity on hand is lower than
-- what the same user's upcoming meal plans require. The subqueries are
-- correlated on the outer row's user_id and ingredient_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pantry_shortfalls AS
SELECT p.pantry_item_id,
       p.user_id,
       u.name AS user_name,
       i.name AS ingredient_name,
       p.quantity_on_hand,
       p.unit,
       (SELECT SUM(ri.required_quantity)
          FROM MealPlans mp
          JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
         WHERE mp.user_id = p.user_id
           AND ri.ingredient_id = p.ingredient_id
           AND mp.planned_date >= CURRENT_DATE) AS quantity_needed
FROM PantryItems p
JOIN Users u       ON u.user_id = p.user_id
JOIN Ingredients i ON i.ingredient_id = p.ingredient_id
WHERE p.quantity_on_hand < (
    SELECT COALESCE(SUM(ri.required_quantity), 0)
      FROM MealPlans mp
      JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
     WHERE mp.user_id = p.user_id
       AND ri.ingredient_id = p.ingredient_id
       AND mp.planned_date >= CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- View 4 (FULL JOIN)
-- Ingredient usage overview: compares pantry stock (summed across all
-- users) with how many recipes use each ingredient. The FULL JOIN keeps
-- ingredients that are stocked but unused by any recipe, and ingredients
-- that recipes need but nobody has in stock.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ingredient_usage_overview AS
SELECT COALESCE(stock.ingredient_id, used.ingredient_id) AS ingredient_id,
       i.name AS ingredient_name,
       i.category,
       COALESCE(stock.total_on_hand, 0) AS total_on_hand,
       COALESCE(stock.households, 0) AS households_stocking,
       COALESCE(used.recipe_count, 0) AS recipes_using,
       CASE
           WHEN stock.ingredient_id IS NULL THEN 'Needed by recipes, not stocked'
           WHEN used.ingredient_id IS NULL THEN 'Stocked, not used by any recipe'
           ELSE 'Stocked and used'
       END AS status
FROM (SELECT ingredient_id, SUM(quantity_on_hand) AS total_on_hand, COUNT(DISTINCT user_id) AS households
        FROM PantryItems GROUP BY ingredient_id) AS stock
FULL JOIN
     (SELECT ingredient_id, COUNT(DISTINCT recipe_id) AS recipe_count
        FROM RecipeIngredients GROUP BY ingredient_id) AS used
  ON stock.ingredient_id = used.ingredient_id
JOIN Ingredients i ON i.ingredient_id = COALESCE(stock.ingredient_id, used.ingredient_id);

-- ---------------------------------------------------------------------
-- View 5 (set operation: EXCEPT)
-- Ingredients to buy: for each user, the ingredients required by their
-- upcoming meal plans EXCEPT the ingredients already in their pantry.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ingredients_to_buy AS
SELECT need.user_id,
       u.name AS user_name,
       need.ingredient_id,
       i.name AS ingredient_name,
       i.category,
       i.estimated_unit_price,
       i.base_unit
FROM (
    SELECT mp.user_id, ri.ingredient_id
      FROM MealPlans mp
      JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
     WHERE mp.planned_date >= CURRENT_DATE
    EXCEPT
    SELECT p.user_id, p.ingredient_id
      FROM PantryItems p
     WHERE p.quantity_on_hand > 0
) AS need
JOIN Users u       ON u.user_id = need.user_id
JOIN Ingredients i ON i.ingredient_id = need.ingredient_id;

-- ---------------------------------------------------------------------
-- View 6: Daily nutrition summary
-- Calories and macronutrients per user per planned day (one serving of
-- each planned recipe), compared against the user's calorie target.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_daily_nutrition_summary AS
SELECT u.user_id,
       u.name AS user_name,
       mp.planned_date,
       COUNT(DISTINCT mp.plan_id) AS meals_planned,
       ROUND(SUM(ri.required_quantity * i.calories_per_unit / COALESCE(NULLIF(r.servings, 0), 1)), 0) AS calories,
       ROUND(SUM(ri.required_quantity * i.protein_g / COALESCE(NULLIF(r.servings, 0), 1)), 1) AS protein_g,
       ROUND(SUM(ri.required_quantity * i.carbs_g / COALESCE(NULLIF(r.servings, 0), 1)), 1) AS carbs_g,
       ROUND(SUM(ri.required_quantity * i.fat_g / COALESCE(NULLIF(r.servings, 0), 1)), 1) AS fat_g,
       u.target_calories
FROM MealPlans mp
JOIN Users u              ON u.user_id = mp.user_id
JOIN Recipes r            ON r.recipe_id = mp.recipe_id
JOIN RecipeIngredients ri ON ri.recipe_id = r.recipe_id
JOIN Ingredients i        ON i.ingredient_id = ri.ingredient_id
GROUP BY u.user_id, u.name, mp.planned_date, u.target_calories;

-- ---------------------------------------------------------------------
-- View 7: Grocery list budget status
-- Each grocery list with its item count, estimated total, remaining
-- budget, whether it is over budget, and purchase progress.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_grocery_list_budget_status AS
SELECT gl.list_id,
       gl.user_id,
       u.name AS user_name,
       gl.status,
       gl.created_at,
       COUNT(li.item_id) AS item_count,
       COALESCE(ROUND(SUM(li.quantity_to_buy * li.estimated_unit_price), 2), 0) AS estimated_total,
       gl.max_budget,
       gl.max_budget - COALESCE(ROUND(SUM(li.quantity_to_buy * li.estimated_unit_price), 2), 0) AS remaining_budget,
       COALESCE(SUM(li.quantity_to_buy * li.estimated_unit_price), 0) > gl.max_budget AS over_budget,
       COALESCE(ROUND(100.0 * SUM(CASE WHEN li.is_purchased THEN 1 ELSE 0 END) / NULLIF(COUNT(li.item_id), 0), 0), 0) AS percent_purchased
FROM GroceryLists gl
JOIN Users u ON u.user_id = gl.user_id
LEFT JOIN ListItems li ON li.list_id = gl.list_id
GROUP BY gl.list_id, gl.user_id, u.name, gl.status, gl.created_at, gl.max_budget;

-- ---------------------------------------------------------------------
-- View 8: Pantry inventory value by category
-- How much stock (and its estimated value) each user holds per category.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pantry_value_by_category AS
SELECT u.user_id,
       u.name AS user_name,
       i.category,
       COUNT(*) AS item_count,
       ROUND(SUM(p.quantity_on_hand * i.estimated_unit_price), 2) AS estimated_value
FROM PantryItems p
JOIN Users u       ON u.user_id = p.user_id
JOIN Ingredients i ON i.ingredient_id = p.ingredient_id
GROUP BY u.user_id, u.name, i.category;

-- ---------------------------------------------------------------------
-- View 9: Recipe nutrition profile
-- Per-serving calories, macros and cost for each recipe, plus a
-- "protein per dollar" value score for budget-conscious users.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_recipe_nutrition_profile AS
SELECT r.recipe_id,
       r.title,
       r.servings,
       r.prep_time_mins,
       COALESCE(u.name, 'NutriCart') AS author,
       ROUND(SUM(ri.required_quantity * i.calories_per_unit) / COALESCE(NULLIF(r.servings, 0), 1), 0) AS calories_per_serving,
       ROUND(SUM(ri.required_quantity * i.protein_g) / COALESCE(NULLIF(r.servings, 0), 1), 1) AS protein_per_serving,
       ROUND(SUM(ri.required_quantity * i.carbs_g) / COALESCE(NULLIF(r.servings, 0), 1), 1) AS carbs_per_serving,
       ROUND(SUM(ri.required_quantity * i.fat_g) / COALESCE(NULLIF(r.servings, 0), 1), 1) AS fat_per_serving,
       ROUND(SUM(ri.required_quantity * i.estimated_unit_price) / COALESCE(NULLIF(r.servings, 0), 1), 2) AS cost_per_serving,
       ROUND(SUM(ri.required_quantity * i.protein_g) / NULLIF(SUM(ri.required_quantity * i.estimated_unit_price), 0), 1) AS protein_g_per_dollar
FROM Recipes r
LEFT JOIN Users u         ON u.user_id = r.created_by_user
JOIN RecipeIngredients ri ON ri.recipe_id = r.recipe_id
JOIN Ingredients i        ON i.ingredient_id = ri.ingredient_id
GROUP BY r.recipe_id, r.title, r.servings, r.prep_time_mins, u.name;

-- ---------------------------------------------------------------------
-- View 10: User activity summary
-- One row per user with counts of their pantry items, meal plans in the
-- next 7 days, active grocery lists and authored recipes (admin overview).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_activity_summary AS
SELECT u.user_id,
       u.name,
       u.email,
       u.role,
       u.weekly_budget_limit,
       (SELECT COUNT(*) FROM PantryItems p WHERE p.user_id = u.user_id) AS pantry_items,
       (SELECT COUNT(*) FROM MealPlans mp
         WHERE mp.user_id = u.user_id
           AND mp.planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6) AS meals_next_7_days,
       (SELECT COUNT(*) FROM GroceryLists gl WHERE gl.user_id = u.user_id AND gl.status = 'Active') AS active_lists,
       (SELECT COUNT(*) FROM Recipes r WHERE r.created_by_user = u.user_id) AS recipes_authored
FROM Users u;
