// Weekly meal planning (MealPlans), plus "cook" which consumes pantry stock.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const { targetUserId } = require('../middleware/auth');

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const planSchema = {
  recipe_id: { type: 'int', required: true, min: 1, label: 'Recipe' },
  planned_date: { type: 'date', required: true, label: 'Date' },
  meal_type: { type: 'enum', values: MEAL_TYPES, required: true, label: 'Meal type' },
};

// Reuses View 1 (v_meal_plan_details) so the page shows cost & calories per serving.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&mealType=Dinner&q=keyword
async function list(req, res) {
  const userId = targetUserId(req);
  const q = validate(req.query, {
    from: { type: 'date', label: 'From' },
    to: { type: 'date', label: 'To' },
    mealType: { type: 'enum', values: MEAL_TYPES, label: 'Meal type' },
    q: { type: 'string', maxLength: 100 },
  });
  const params = [userId];
  const where = ['user_id = $1'];
  if (q.from) { params.push(q.from); where.push(`planned_date >= $${params.length}`); }
  if (q.to) { params.push(q.to); where.push(`planned_date <= $${params.length}`); }
  if (q.mealType) { params.push(q.mealType); where.push(`meal_type = $${params.length}`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`recipe_title ILIKE $${params.length}`); }
  const rows = await db.query(
    `SELECT * FROM v_meal_plan_details WHERE ${where.join(' AND ')}
      ORDER BY planned_date,
               CASE meal_type WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Dinner' THEN 3 ELSE 4 END`,
    params,
  );
  res.json({ plans: rows });
}

async function loadPlan(id, userId) {
  const [row] = await db.query(
    `SELECT mp.plan_id, mp.user_id, mp.recipe_id, r.title AS recipe_title, mp.planned_date, mp.meal_type
       FROM MealPlans mp JOIN Recipes r ON r.recipe_id = mp.recipe_id
      WHERE mp.plan_id = $1 AND mp.user_id = $2`,
    [id, userId],
  );
  if (!row) throw ApiError.notFound('Meal plan');
  return row;
}

async function getOne(req, res) {
  res.json({ plan: await loadPlan(intParam(req.params.id), targetUserId(req)) });
}

async function assertRecipe(recipeId) {
  const [r] = await db.query('SELECT 1 FROM Recipes WHERE recipe_id = $1', [recipeId]);
  if (!r) throw ApiError.badRequest('Unknown recipe');
}

async function create(req, res) {
  const userId = targetUserId(req);
  const d = validate(req.body, planSchema);
  await assertRecipe(d.recipe_id);
  const [row] = await db.query(
    'INSERT INTO MealPlans (user_id, recipe_id, planned_date, meal_type) VALUES ($1, $2, $3, $4) RETURNING plan_id',
    [userId, d.recipe_id, d.planned_date, d.meal_type],
  );
  res.status(201).json({ plan: await loadPlan(row.plan_id, userId) });
}

async function update(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const d = validate(req.body, planSchema, { partial: true });
  if (d.recipe_id) await assertRecipe(d.recipe_id);
  const cols = Object.keys(d);
  const rows = await db.query(
    `UPDATE MealPlans SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}
      WHERE plan_id = $1 AND user_id = $2 RETURNING plan_id`,
    [id, userId, ...cols.map((c) => d[c])],
  );
  if (!rows.length) throw ApiError.notFound('Meal plan');
  res.json({ plan: await loadPlan(id, userId) });
}

async function remove(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const rows = await db.query('DELETE FROM MealPlans WHERE plan_id = $1 AND user_id = $2 RETURNING plan_id', [id, userId]);
  if (!rows.length) throw ApiError.notFound('Meal plan');
  res.json({ deleted: id });
}

// Cheaper swaps for one planned meal, from View 2 (v_cheaper_swaps): recipes
// that cost less per serving than this meal, still have at least
// SWAP_MIN_CALORIE_SHARE of its calories (so a dinner isn't swapped for a snack),
// and aren't the same recipe. Cheapest first.
const SWAP_MIN_CALORIE_SHARE = 0.6;

async function swaps(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const [meal] = await db.query(
    'SELECT plan_id, recipe_id, recipe_title, meal_type, planned_date, cost_per_serving, calories_per_serving FROM v_meal_plan_details WHERE plan_id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!meal) throw ApiError.notFound('Meal plan');
  const rows = await db.query(
    `SELECT recipe_id, title, cost_per_serving, calories_per_serving, protein_per_serving,
            ROUND($3::numeric - cost_per_serving, 2) AS saving
       FROM v_cheaper_swaps
      WHERE user_id = $1 AND recipe_id <> $2
        AND cost_per_serving < $3 AND calories_per_serving >= $4
      ORDER BY cost_per_serving, title`,
    [userId, meal.recipe_id, meal.cost_per_serving, Math.floor(meal.calories_per_serving * SWAP_MIN_CALORIE_SHARE)],
  );
  res.json({ meal, swaps: rows });
}

// "I cooked this": subtract the recipe's ingredients from the pantry (never
// below zero) and remove the meal from the plan, all in one transaction.
async function cook(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const plan = await loadPlan(id, userId);
  const used = await db.transaction(async (tx) => {
    const rows = await tx.query(
      `UPDATE PantryItems p
          SET quantity_on_hand = GREATEST(p.quantity_on_hand - ri.required_quantity, 0),
              last_updated = CURRENT_TIMESTAMP
         FROM RecipeIngredients ri
        WHERE ri.recipe_id = $1 AND p.ingredient_id = ri.ingredient_id AND p.user_id = $2
        RETURNING p.ingredient_id, p.quantity_on_hand`,
      [plan.recipe_id, userId],
    );
    await tx.query('DELETE FROM MealPlans WHERE plan_id = $1', [id]);
    return rows;
  });
  res.json({ cooked: plan, pantryUpdated: used.length });
}

module.exports = { list, getOne, create, update, remove, cook, swaps, MEAL_TYPES };
