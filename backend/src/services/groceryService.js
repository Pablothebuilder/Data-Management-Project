// Grocery list business logic: loading a list with its items, generating a
// list from a meal plan ("reverse meal planning"), and completing a list.
const { ApiError } = require('../utils/errors');

async function loadList(q, listId, userId) {
  const [list] = await q(
    `SELECT gl.list_id, gl.user_id, u.name AS user_name, gl.created_at, gl.max_budget, gl.status
       FROM GroceryLists gl JOIN Users u ON u.user_id = gl.user_id
      WHERE gl.list_id = $1 AND gl.user_id = $2`,
    [listId, userId],
  );
  if (!list) throw ApiError.notFound('Grocery list');
  list.items = await q(
    `SELECT li.item_id, li.ingredient_id, i.name, i.category, i.base_unit AS unit, li.quantity_to_buy,
            li.estimated_unit_price, ROUND(li.quantity_to_buy * li.estimated_unit_price, 2) AS line_total,
            li.is_purchased
       FROM ListItems li JOIN Ingredients i ON i.ingredient_id = li.ingredient_id
      WHERE li.list_id = $1 ORDER BY i.category, i.name`,
    [listId],
  );
  const total = list.items.reduce((s, it) => s + it.line_total, 0);
  const purchased = list.items.filter((it) => it.is_purchased).reduce((s, it) => s + it.line_total, 0);
  list.estimated_total = Math.round(total * 100) / 100;
  list.purchased_total = Math.round(purchased * 100) / 100;
  list.remaining_budget = Math.round((list.max_budget - total) * 100) / 100;
  list.over_budget = total > list.max_budget;
  return list;
}

// Net purchasing requirement for a date range:
//   needed (sum of recipe quantities over planned meals) - on hand (pantry)
// Only ingredients where needed > on hand are returned.
const NET_NEEDS_SQL = `
  WITH needs AS (
    SELECT ri.ingredient_id, SUM(ri.required_quantity) AS needed
      FROM MealPlans mp
      JOIN RecipeIngredients ri ON ri.recipe_id = mp.recipe_id
     WHERE mp.user_id = $1 AND mp.planned_date BETWEEN $2 AND $3
     GROUP BY ri.ingredient_id
  )
  SELECT n.ingredient_id, i.name, i.category, i.base_unit, n.needed,
         COALESCE(p.quantity_on_hand, 0) AS on_hand,
         n.needed - COALESCE(p.quantity_on_hand, 0) AS to_buy,
         i.estimated_unit_price
    FROM needs n
    JOIN Ingredients i ON i.ingredient_id = n.ingredient_id
    LEFT JOIN PantryItems p ON p.user_id = $1 AND p.ingredient_id = n.ingredient_id
   WHERE n.needed > COALESCE(p.quantity_on_hand, 0)
   ORDER BY i.category, i.name`;

// Units that only make sense as whole numbers when buying.
const WHOLE_UNITS = new Set(['each', 'slice', 'clove', 'can', 'unit', 'pack']);

function roundUpPurchase(qty, unit) {
  if (WHOLE_UNITS.has(String(unit).toLowerCase())) return Math.ceil(qty - 1e-9);
  return Math.ceil(qty * 100 - 1e-9) / 100;
}

async function previewNeeds(q, userId, from, to) {
  const rows = await q(NET_NEEDS_SQL, [userId, from, to]);
  return rows.map((r) => {
    const quantity = roundUpPurchase(r.to_buy, r.base_unit);
    return { ...r, to_buy: quantity, line_total: Math.round(quantity * r.estimated_unit_price * 100) / 100 };
  });
}

async function generate(tx, userId, { from, to, maxBudget }) {
  const needs = await previewNeeds(tx.query, userId, from, to);
  if (!needs.length) return null;
  const [list] = await tx.query(
    `INSERT INTO GroceryLists (user_id, max_budget, status)
     VALUES ($1, COALESCE($2, (SELECT weekly_budget_limit FROM Users WHERE user_id = $1)), 'Active')
     RETURNING list_id`,
    [userId, maxBudget ?? null],
  );
  for (const n of needs) {
    await tx.query(
      `INSERT INTO ListItems (list_id, ingredient_id, quantity_to_buy, estimated_unit_price)
       VALUES ($1, $2, $3, $4)`,
      [list.list_id, n.ingredient_id, n.to_buy, n.estimated_unit_price],
    );
  }
  return list.list_id;
}

// Completing a list moves every purchased item into the pantry.
async function complete(tx, listId, userId) {
  const moved = await tx.query(
    `INSERT INTO PantryItems (user_id, ingredient_id, quantity_on_hand, unit)
     SELECT $2, li.ingredient_id, li.quantity_to_buy, i.base_unit
       FROM ListItems li JOIN Ingredients i ON i.ingredient_id = li.ingredient_id
      WHERE li.list_id = $1 AND li.is_purchased
     ON CONFLICT (user_id, ingredient_id)
     DO UPDATE SET quantity_on_hand = PantryItems.quantity_on_hand + EXCLUDED.quantity_on_hand,
                   last_updated = CURRENT_TIMESTAMP
     RETURNING ingredient_id`,
    [listId, userId],
  );
  await tx.query("UPDATE GroceryLists SET status = 'Completed' WHERE list_id = $1", [listId]);
  return moved.length;
}

module.exports = { loadList, previewNeeds, generate, complete };
