// A user's pantry (PantryItems). Users see only their own; admins can pass ?userId=.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const { targetUserId } = require('../middleware/auth');

const SORTABLE = {
  name: 'i.name', category: 'i.category, i.name', quantity: 'p.quantity_on_hand',
  value: 'estimated_value DESC', updated: 'p.last_updated DESC',
};

const SELECT = `
  SELECT p.pantry_item_id, p.user_id, p.ingredient_id, i.name, i.category, p.quantity_on_hand, p.unit,
         i.estimated_unit_price, ROUND(p.quantity_on_hand * i.estimated_unit_price, 2) AS estimated_value,
         p.last_updated,
         -- correlated subquery: how much of this ingredient upcoming meal plans need
         (SELECT COALESCE(SUM(ri.required_quantity), 0)
            FROM MealPlans mp JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
           WHERE mp.user_id = p.user_id AND ri.ingredient_id = p.ingredient_id
             AND mp.planned_date >= CURRENT_DATE) AS needed_for_plans
    FROM PantryItems p JOIN Ingredients i ON i.ingredient_id = p.ingredient_id`;

// ?q=keyword&category=Produce&status=short|empty&sort=value
async function list(req, res) {
  const userId = targetUserId(req);
  const params = [userId];
  const where = ['p.user_id = $1'];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`i.name ILIKE $${params.length}`); }
  if (req.query.category) { params.push(req.query.category); where.push(`i.category = $${params.length}`); }
  if (req.query.status === 'empty') where.push('p.quantity_on_hand = 0');
  // "Short for upcoming meals" filter is answered by View 3 (v_pantry_shortfalls).
  if (req.query.status === 'short') where.push('p.pantry_item_id IN (SELECT pantry_item_id FROM v_pantry_shortfalls)');
  const sort = SORTABLE[req.query.sort] || 'i.name';
  const rows = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${sort}`, params);
  res.json({ items: rows });
}

// View 3: items the user has, but not enough of, for their upcoming meals.
async function shortfalls(req, res) {
  const rows = await db.query(
    `SELECT pantry_item_id, ingredient_name, quantity_on_hand, quantity_needed, unit,
            quantity_needed - quantity_on_hand AS quantity_missing
       FROM v_pantry_shortfalls WHERE user_id = $1 ORDER BY ingredient_name`,
    [targetUserId(req)],
  );
  res.json({ shortfalls: rows });
}

// View 5: items in the pantry that no upcoming meal uses (likely to go to waste),
// with how many recipes could use them up.
async function unplanned(req, res) {
  const rows = await db.query(
    `SELECT ingredient_id, ingredient_name, category, quantity_on_hand, unit, estimated_value, recipes_using
       FROM v_unplanned_pantry_items WHERE user_id = $1 ORDER BY estimated_value DESC, ingredient_name`,
    [targetUserId(req)],
  );
  res.json({ items: rows });
}

// View 8: what the pantry is worth, per category.
async function summary(req, res) {
  const rows = await db.query(
    `SELECT category, item_count, estimated_value
       FROM v_pantry_value_by_category WHERE user_id = $1 ORDER BY estimated_value DESC`,
    [targetUserId(req)],
  );
  res.json({ categories: rows });
}

async function loadItem(id, userId) {
  const [row] = await db.query(`${SELECT} WHERE p.pantry_item_id = $1 AND p.user_id = $2`, [id, userId]);
  if (!row) throw ApiError.notFound('Pantry item');
  return row;
}

async function getOne(req, res) {
  res.json({ item: await loadItem(intParam(req.params.id), targetUserId(req)) });
}

// Adding an ingredient that is already in the pantry tops up the existing row
// (UNIQUE(user_id, ingredient_id) + ON CONFLICT) instead of failing.
async function create(req, res) {
  const userId = targetUserId(req);
  const d = validate(req.body, {
    ingredient_id: { type: 'int', required: true, min: 1, label: 'Ingredient' },
    quantity_on_hand: { type: 'number', required: true, min: 0, max: 99999999, label: 'Quantity' },
    unit: { type: 'string', maxLength: 20, label: 'Unit' },
  });
  const [ing] = await db.query('SELECT base_unit FROM Ingredients WHERE ingredient_id = $1', [d.ingredient_id]);
  if (!ing) throw ApiError.badRequest('Unknown ingredient');
  const [row] = await db.query(
    `INSERT INTO PantryItems (user_id, ingredient_id, quantity_on_hand, unit) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, ingredient_id)
     DO UPDATE SET quantity_on_hand = PantryItems.quantity_on_hand + EXCLUDED.quantity_on_hand,
                   last_updated = CURRENT_TIMESTAMP
     RETURNING pantry_item_id`,
    [userId, d.ingredient_id, d.quantity_on_hand, d.unit || ing.base_unit],
  );
  res.status(201).json({ item: await loadItem(row.pantry_item_id, userId) });
}

async function update(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const d = validate(req.body, {
    quantity_on_hand: { type: 'number', min: 0, max: 99999999, label: 'Quantity' },
    unit: { type: 'string', maxLength: 20, label: 'Unit' },
  }, { partial: true });
  const cols = Object.keys(d);
  const rows = await db.query(
    `UPDATE PantryItems SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, last_updated = CURRENT_TIMESTAMP
      WHERE pantry_item_id = $1 AND user_id = $2 RETURNING pantry_item_id`,
    [id, userId, ...cols.map((c) => d[c])],
  );
  if (!rows.length) throw ApiError.notFound('Pantry item');
  res.json({ item: await loadItem(id, userId) });
}

async function remove(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const rows = await db.query('DELETE FROM PantryItems WHERE pantry_item_id = $1 AND user_id = $2 RETURNING pantry_item_id', [id, userId]);
  if (!rows.length) throw ApiError.notFound('Pantry item');
  res.json({ deleted: id });
}

module.exports = { list, shortfalls, unplanned, summary, getOne, create, update, remove };
