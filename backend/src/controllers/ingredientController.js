// Ingredient catalog (shared by all users).
// Read: everyone. Create: Admin/User. Update/Delete: Admin.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');

const ingredientSchema = {
  name: { type: 'string', required: true, maxLength: 100, label: 'Name' },
  category: { type: 'string', required: true, maxLength: 50, label: 'Category' },
  base_unit: { type: 'string', required: true, maxLength: 20, label: 'Unit' },
  estimated_unit_price: { type: 'number', required: true, min: 0, max: 99999999, label: 'Price per unit' },
  calories_per_unit: { type: 'int', required: true, min: 0, max: 1000000, label: 'Calories per unit' },
  protein_g: { type: 'number', min: 0, max: 9999.9, default: 0, label: 'Protein (g)' },
  carbs_g: { type: 'number', min: 0, max: 9999.9, default: 0, label: 'Carbs (g)' },
  fat_g: { type: 'number', min: 0, max: 9999.9, default: 0, label: 'Fat (g)' },
};

const SORTABLE = {
  name: 'i.name', category: 'i.category, i.name', price: 'i.estimated_unit_price', calories: 'i.calories_per_unit',
  protein: 'i.protein_g DESC', id: 'i.ingredient_id', usage: 'recipes_using DESC, i.name',
};

// Usage filter values -> View 4 status
const USAGE = {
  used: "u.recipes_using > 0",
  unused: "COALESCE(u.recipes_using, 0) = 0",
  unstocked: "u.status = 'Needed by recipes, not stocked'",
};

// Search & filter: ?q=keyword&category=Dairy&maxPrice=1&minProtein=5&usage=unused&sort=price&limit=20
// Every row is joined to View 4 (v_ingredient_usage_overview) so the catalog
// shows how many recipes use each ingredient and how many households stock it.
async function list(req, res) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.q) add('i.name ILIKE ?', `%${req.query.q}%`);
  if (req.query.category) add('i.category = ?', req.query.category);
  if (req.query.maxPrice && Number.isFinite(Number(req.query.maxPrice))) add('i.estimated_unit_price <= ?', Number(req.query.maxPrice));
  if (req.query.minProtein && Number.isFinite(Number(req.query.minProtein))) add('i.protein_g >= ?', Number(req.query.minProtein));
  if (USAGE[req.query.usage]) where.push(USAGE[req.query.usage]);
  const sort = SORTABLE[req.query.sort] || 'i.name';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 500);
  const rows = await db.query(
    `SELECT i.*,
            COALESCE(u.recipes_using, 0) AS recipes_using,
            COALESCE(u.households_stocking, 0) AS households_stocking,
            COALESCE(u.status, 'Not used or stocked') AS usage_status
       FROM Ingredients i
       LEFT JOIN v_ingredient_usage_overview u ON u.ingredient_id = i.ingredient_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${sort} LIMIT ${limit}`,
    params,
  );
  res.json({ ingredients: rows });
}

async function categories(req, res) {
  const rows = await db.query('SELECT category, COUNT(*) AS count FROM Ingredients GROUP BY category ORDER BY category');
  res.json({ categories: rows });
}

async function getOne(req, res) {
  const id = intParam(req.params.id);
  const [row] = await db.query('SELECT * FROM Ingredients WHERE ingredient_id = $1', [id]);
  if (!row) throw ApiError.notFound('Ingredient');
  res.json({ ingredient: row });
}

async function create(req, res) {
  const d = validate(req.body, ingredientSchema);
  const [dup] = await db.query('SELECT ingredient_id FROM Ingredients WHERE LOWER(name) = LOWER($1)', [d.name]);
  if (dup) throw ApiError.conflict(`"${d.name}" is already in the catalog`);
  const [row] = await db.query(
    `INSERT INTO Ingredients (name, category, base_unit, estimated_unit_price, calories_per_unit, protein_g, carbs_g, fat_g)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [d.name, d.category, d.base_unit, d.estimated_unit_price, d.calories_per_unit, d.protein_g, d.carbs_g, d.fat_g],
  );
  res.status(201).json({ ingredient: row });
}

async function update(req, res) {
  const id = intParam(req.params.id);
  const d = validate(req.body, ingredientSchema, { partial: true });
  const cols = Object.keys(d);
  const [row] = await db.query(
    `UPDATE Ingredients SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE ingredient_id = $1 RETURNING *`,
    [id, ...cols.map((c) => d[c])],
  );
  if (!row) throw ApiError.notFound('Ingredient');
  res.json({ ingredient: row });
}

async function remove(req, res) {
  const id = intParam(req.params.id);
  const rows = await db.query('DELETE FROM Ingredients WHERE ingredient_id = $1 RETURNING ingredient_id', [id]);
  if (!rows.length) throw ApiError.notFound('Ingredient');
  res.json({ deleted: id });
}

async function priceHistory(req, res) {
  const id = intParam(req.params.id);
  const rows = await db.query(
    `SELECT price_id, source, product_code, product_name, observed_price, currency, price_per_base_unit, observed_on, fetched_at
       FROM IngredientPriceHistory WHERE ingredient_id = $1 ORDER BY COALESCE(observed_on, fetched_at::date), price_id`,
    [id],
  );
  res.json({ prices: rows });
}

module.exports = { list, categories, getOne, create, update, remove, priceHistory, ingredientSchema };
