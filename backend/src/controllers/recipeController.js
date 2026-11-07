// Recipes and their ingredient lists (Recipes + RecipeIngredients).
// Everyone can browse; Users/Admins can create; only the author or an Admin can edit/delete.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const { currentUser } = require('../middleware/auth');

const recipeSchema = {
  title: { type: 'string', required: true, maxLength: 150, label: 'Title' },
  prep_time_mins: { type: 'int', min: 1, max: 10000, nullable: true, label: 'Prep time' },
  servings: { type: 'int', min: 1, max: 1000, nullable: true, label: 'Servings' },
  ingredients: {
    type: 'array',
    minItems: 1,
    label: 'Ingredients',
    items: {
      ingredient_id: { type: 'int', required: true, min: 1, label: 'Ingredient' },
      required_quantity: { type: 'number', required: true, gt: 0, max: 99999999, label: 'Quantity' },
      unit: { type: 'string', maxLength: 20, label: 'Unit' },
    },
  },
};

// Aggregated nutrition/cost per recipe. LEFT JOINs keep recipes without ingredients.
const RECIPE_SELECT = `
  SELECT r.recipe_id, r.title, r.prep_time_mins, r.servings, r.created_by_user,
         COALESCE(u.name, 'NutriCart') AS author,
         COUNT(ri.ingredient_id) AS ingredient_count,
         COALESCE(ROUND(SUM(ri.required_quantity * i.estimated_unit_price), 2), 0) AS total_cost,
         COALESCE(ROUND(SUM(ri.required_quantity * i.estimated_unit_price) / COALESCE(NULLIF(r.servings, 0), 1), 2), 0) AS cost_per_serving,
         COALESCE(ROUND(SUM(ri.required_quantity * i.calories_per_unit) / COALESCE(NULLIF(r.servings, 0), 1), 0), 0) AS calories_per_serving,
         COALESCE(ROUND(SUM(ri.required_quantity * i.protein_g) / COALESCE(NULLIF(r.servings, 0), 1), 1), 0) AS protein_per_serving,
         COALESCE(ROUND(SUM(ri.required_quantity * i.carbs_g) / COALESCE(NULLIF(r.servings, 0), 1), 1), 0) AS carbs_per_serving,
         COALESCE(ROUND(SUM(ri.required_quantity * i.fat_g) / COALESCE(NULLIF(r.servings, 0), 1), 1), 0) AS fat_per_serving,
         -- View 2: is this recipe affordable within every user's daily budget?
         EXISTS (SELECT 1 FROM v_budget_friendly_recipes b WHERE b.recipe_id = r.recipe_id) AS budget_friendly,
         -- share of this recipe's ingredients the current user already has enough of ($1 = user id or NULL)
         COALESCE(ROUND(100.0 * SUM(CASE WHEN p.quantity_on_hand >= ri.required_quantity THEN 1 ELSE 0 END)
                        / NULLIF(COUNT(ri.ingredient_id), 0), 0), 0) AS pantry_match_pct
    FROM Recipes r
    LEFT JOIN Users u              ON u.user_id = r.created_by_user
    LEFT JOIN RecipeIngredients ri ON ri.recipe_id = r.recipe_id
    LEFT JOIN Ingredients i        ON i.ingredient_id = ri.ingredient_id
    LEFT JOIN PantryItems p        ON p.ingredient_id = ri.ingredient_id AND p.user_id = $1`;
const RECIPE_GROUP = 'GROUP BY r.recipe_id, r.title, r.prep_time_mins, r.servings, r.created_by_user, u.name';

const SORTABLE = {
  title: 'r.title', prep: 'r.prep_time_mins NULLS LAST', cost: 'cost_per_serving', calories: 'calories_per_serving',
  protein: 'protein_per_serving DESC', match: 'pantry_match_pct DESC, r.title',
};

// ?q=keyword&maxPrep=20&ingredientId=5&mine=1&budget=1&maxCost=3&sort=cost
async function list(req, res) {
  const user = currentUser(req);
  const params = [user.user_id];
  const where = [];
  const having = [];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`r.title ILIKE $${params.length}`); }
  if (Number(req.query.maxPrep) > 0) { params.push(Number(req.query.maxPrep)); where.push(`r.prep_time_mins <= $${params.length}`); }
  if (Number(req.query.ingredientId) > 0) {
    params.push(Number(req.query.ingredientId));
    where.push(`r.recipe_id IN (SELECT recipe_id FROM RecipeIngredients WHERE ingredient_id = $${params.length})`);
  }
  if (req.query.mine === '1' && user.user_id) where.push('r.created_by_user = $1');
  if (req.query.budget === '1') where.push('r.recipe_id IN (SELECT recipe_id FROM v_budget_friendly_recipes)');
  if (Number(req.query.maxCost) > 0) {
    params.push(Number(req.query.maxCost));
    having.push(`COALESCE(SUM(ri.required_quantity * i.estimated_unit_price) / COALESCE(NULLIF(r.servings, 0), 1), 0) <= $${params.length}`);
  }
  const sort = SORTABLE[req.query.sort] || 'r.title';
  const rows = await db.query(
    `${RECIPE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${RECIPE_GROUP}
     ${having.length ? `HAVING ${having.join(' AND ')}` : ''} ORDER BY ${sort}`,
    params,
  );
  res.json({ recipes: rows });
}

async function loadRecipe(id, userId) {
  const [recipe] = await db.query(`${RECIPE_SELECT} WHERE r.recipe_id = $2 ${RECIPE_GROUP}`, [userId, id]);
  if (!recipe) throw ApiError.notFound('Recipe');
  recipe.ingredients = await db.query(
    `SELECT ri.ingredient_id, i.name, i.category, ri.required_quantity, ri.unit, i.estimated_unit_price,
            ROUND(ri.required_quantity * i.estimated_unit_price, 2) AS line_cost,
            ROUND(ri.required_quantity * i.calories_per_unit, 0) AS line_calories,
            COALESCE(p.quantity_on_hand, 0) AS on_hand
       FROM RecipeIngredients ri
       JOIN Ingredients i ON i.ingredient_id = ri.ingredient_id
       LEFT JOIN PantryItems p ON p.ingredient_id = ri.ingredient_id AND p.user_id = $2
      WHERE ri.recipe_id = $1 ORDER BY i.name`,
    [id, userId],
  );
  return recipe;
}

async function getOne(req, res) {
  res.json({ recipe: await loadRecipe(intParam(req.params.id), currentUser(req).user_id) });
}

async function writeIngredients(tx, recipeId, items) {
  const ids = items.map((it) => it.ingredient_id);
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each ingredient may only appear once in a recipe');
  const known = await tx.query('SELECT ingredient_id, base_unit FROM Ingredients WHERE ingredient_id = ANY($1::int[])', [ids]);
  const units = new Map(known.map((k) => [k.ingredient_id, k.base_unit]));
  const missing = ids.filter((id) => !units.has(id));
  if (missing.length) throw ApiError.badRequest(`Unknown ingredient id(s): ${missing.join(', ')}`);
  await tx.query('DELETE FROM RecipeIngredients WHERE recipe_id = $1', [recipeId]);
  for (const it of items) {
    await tx.query(
      'INSERT INTO RecipeIngredients (recipe_id, ingredient_id, required_quantity, unit) VALUES ($1, $2, $3, $4)',
      [recipeId, it.ingredient_id, it.required_quantity, it.unit || units.get(it.ingredient_id)],
    );
  }
}

async function create(req, res) {
  const d = validate(req.body, { ...recipeSchema, ingredients: { ...recipeSchema.ingredients, required: true } });
  const user = currentUser(req);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.query(
      'INSERT INTO Recipes (title, prep_time_mins, servings, created_by_user) VALUES ($1, $2, $3, $4) RETURNING recipe_id',
      [d.title, d.prep_time_mins ?? null, d.servings ?? 1, user.user_id],
    );
    await writeIngredients(tx, row.recipe_id, d.ingredients);
    return row.recipe_id;
  });
  res.status(201).json({ recipe: await loadRecipe(id, user.user_id) });
}

async function assertCanEdit(req, id) {
  const [row] = await db.query('SELECT created_by_user FROM Recipes WHERE recipe_id = $1', [id]);
  if (!row) throw ApiError.notFound('Recipe');
  const user = currentUser(req);
  if (user.role !== 'Admin' && row.created_by_user !== user.user_id) {
    throw ApiError.forbidden('Only the recipe author or an admin can change this recipe');
  }
}

async function update(req, res) {
  const id = intParam(req.params.id);
  await assertCanEdit(req, id);
  const d = validate(req.body, recipeSchema, { partial: true });
  await db.transaction(async (tx) => {
    const cols = ['title', 'prep_time_mins', 'servings'].filter((c) => c in d);
    if (cols.length) {
      await tx.query(
        `UPDATE Recipes SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE recipe_id = $1`,
        [id, ...cols.map((c) => d[c])],
      );
    }
    if (d.ingredients) await writeIngredients(tx, id, d.ingredients);
  });
  res.json({ recipe: await loadRecipe(id, currentUser(req).user_id) });
}

async function remove(req, res) {
  const id = intParam(req.params.id);
  await assertCanEdit(req, id);
  await db.query('DELETE FROM Recipes WHERE recipe_id = $1', [id]);
  res.json({ deleted: id });
}

module.exports = { list, getOne, create, update, remove };
