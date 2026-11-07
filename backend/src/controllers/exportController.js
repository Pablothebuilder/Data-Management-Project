// GET /api/export/:dataset?format=csv|pdf
// Datasets: pantry, ingredients, recipes, meal-plans, grocery-list (needs ?id=),
// and any of the 10 views by name (e.g. v_pantry_shortfalls) or number (view-3).
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { intParam } = require('../utils/validate');
const { currentUser, targetUserId } = require('../middleware/auth');
const { toCsv, writePdf } = require('../services/exportService');
const { runView } = require('./viewController');
const grocery = require('../services/groceryService');

const DATASETS = {
  ingredients: async () => ({
    title: 'Ingredient Catalog',
    rows: await db.query(`SELECT ingredient_id, name, category, base_unit, estimated_unit_price, calories_per_unit,
                                 protein_g, carbs_g, fat_g FROM Ingredients ORDER BY category, name`),
  }),
  recipes: async () => ({
    title: 'Recipes',
    rows: await db.query(`SELECT recipe_id, title, author, servings, prep_time_mins, calories_per_serving,
                                 protein_per_serving, cost_per_serving FROM v_recipe_nutrition_profile ORDER BY title`),
  }),
  pantry: async (req) => ({
    title: 'Pantry Inventory',
    rows: await db.query(`SELECT i.name, i.category, p.quantity_on_hand, p.unit,
                                 ROUND(p.quantity_on_hand * i.estimated_unit_price, 2) AS estimated_value, p.last_updated
                            FROM PantryItems p JOIN Ingredients i ON i.ingredient_id = p.ingredient_id
                           WHERE p.user_id = $1 ORDER BY i.category, i.name`, [targetUserId(req)]),
  }),
  'meal-plans': async (req) => ({
    title: 'Meal Plan',
    rows: await db.query(`SELECT planned_date, meal_type, recipe_title, servings, calories_per_serving, cost_per_serving
                            FROM v_meal_plan_details WHERE user_id = $1 AND planned_date >= CURRENT_DATE - 7
                           ORDER BY planned_date, meal_type`, [targetUserId(req)]),
  }),
  'grocery-list': async (req) => {
    const list = await grocery.loadList((t, p) => db.query(t, p), intParam(req.query.id), targetUserId(req));
    return {
      title: `Grocery List #${list.list_id}`,
      subtitle: `Budget $${list.max_budget.toFixed(2)} - Estimated $${list.estimated_total.toFixed(2)} - ${list.status}`,
      rows: list.items.map((it) => ({
        item: it.name, category: it.category, quantity: it.quantity_to_buy, unit: it.unit,
        unit_price: it.estimated_unit_price, line_total: it.line_total, purchased: it.is_purchased,
      })),
    };
  },
};

async function exportData(req, res) {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'pdf'].includes(format)) throw ApiError.badRequest('format must be csv or pdf');
  const { dataset } = req.params;

  let data;
  if (DATASETS[dataset]) {
    // Personal datasets call targetUserId(), which rejects Guests with a 403.
    data = await DATASETS[dataset](req);
  } else {
    const viewKey = dataset.replace(/^view-/, '');
    const { view, rows } = await runView(currentUser(req), viewKey, req.query);
    data = { title: `View ${view.number}: ${view.title}`, subtitle: view.requirement, rows };
  }

  const filename = `nutricart-${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (format === 'csv') {
    res.type('text/csv; charset=utf-8').send(toCsv(data.rows));
  } else {
    res.type('application/pdf');
    writePdf(res, data);
  }
}

module.exports = { exportData };
