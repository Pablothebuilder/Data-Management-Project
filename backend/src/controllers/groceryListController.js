// Grocery lists (GroceryLists + ListItems), budget tracking, generation from
// the meal plan, completion into the pantry, and the XML web service.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const { targetUserId } = require('../middleware/auth');
const grocery = require('../services/groceryService');
const { groceryListToXml } = require('../services/xmlService');

const STATUSES = ['Active', 'Completed', 'Archived'];
const q = (text, params) => db.query(text, params);

// Uses View 7 (v_grocery_list_budget_status). ?status=Active
async function list(req, res) {
  const userId = targetUserId(req);
  const params = [userId];
  let where = 'user_id = $1';
  if (req.query.status) {
    const { status } = validate(req.query, { status: { type: 'enum', values: STATUSES } });
    params.push(status);
    where += ' AND status = $2';
  }
  const rows = await db.query(`SELECT * FROM v_grocery_list_budget_status WHERE ${where} ORDER BY created_at DESC`, params);
  res.json({ lists: rows });
}

async function getOne(req, res) {
  res.json({ list: await grocery.loadList(q, intParam(req.params.id), targetUserId(req)) });
}

async function create(req, res) {
  const userId = targetUserId(req);
  const d = validate(req.body, {
    max_budget: { type: 'number', min: 0, max: 99999999, label: 'Budget' },
  });
  const [row] = await db.query(
    `INSERT INTO GroceryLists (user_id, max_budget)
     VALUES ($1, COALESCE($2, (SELECT weekly_budget_limit FROM Users WHERE user_id = $1))) RETURNING list_id`,
    [userId, d.max_budget ?? null],
  );
  res.status(201).json({ list: await grocery.loadList(q, row.list_id, userId) });
}

async function update(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const d = validate(req.body, {
    max_budget: { type: 'number', min: 0, max: 99999999, label: 'Budget' },
    status: { type: 'enum', values: STATUSES, label: 'Status' },
  }, { partial: true });
  const current = await grocery.loadList(q, id, userId);
  // Status rules: Active <-> Archived. "Completed" is only reached through
  // POST /:id/complete (which stocks the pantry) and is final, so purchased
  // items can never be added to the pantry twice.
  if (d.status && d.status !== current.status) {
    if (d.status === 'Completed') throw ApiError.badRequest('Use "Complete" to finish a list so purchased items are added to your pantry');
    if (current.status === 'Completed') throw ApiError.badRequest('Completed lists are a final record and cannot change status');
  }
  const cols = Object.keys(d);
  await db.query(
    `UPDATE GroceryLists SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}
      WHERE list_id = $1 AND user_id = $2`,
    [id, userId, ...cols.map((c) => d[c])],
  );
  res.json({ list: await grocery.loadList(q, id, userId) });
}

async function remove(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const rows = await db.query('DELETE FROM GroceryLists WHERE list_id = $1 AND user_id = $2 RETURNING list_id', [id, userId]);
  if (!rows.length) throw ApiError.notFound('Grocery list');
  res.json({ deleted: id });
}

function rangeSchema() {
  return {
    from: { type: 'date', required: true, label: 'From date' },
    to: { type: 'date', required: true, label: 'To date' },
    max_budget: { type: 'number', min: 0, max: 99999999, label: 'Budget' },
  };
}

function checkRange(d) {
  if (d.from > d.to) throw ApiError.badRequest('From date must be on or before To date');
}

// GET /api/grocery-lists/preview?from=&to= : what would be bought, without saving.
async function preview(req, res) {
  const userId = targetUserId(req);
  const d = validate(req.query, rangeSchema());
  checkRange(d);
  const items = await grocery.previewNeeds(q, userId, d.from, d.to);
  const total = Math.round(items.reduce((s, it) => s + it.line_total, 0) * 100) / 100;
  res.json({ items, estimated_total: total });
}

// POST /api/grocery-lists/generate {from, to, max_budget?}
async function generate(req, res) {
  const userId = targetUserId(req);
  const d = validate(req.body, rangeSchema());
  checkRange(d);
  const listId = await db.transaction((tx) => grocery.generate(tx, userId, { from: d.from, to: d.to, maxBudget: d.max_budget }));
  if (!listId) {
    return res.json({ list: null, message: 'Your pantry already covers every meal planned in that range - nothing to buy!' });
  }
  return res.status(201).json({ list: await grocery.loadList(q, listId, userId) });
}

async function complete(req, res) {
  const userId = targetUserId(req);
  const id = intParam(req.params.id);
  const current = await grocery.loadList(q, id, userId); // ownership + existence check
  if (current.status !== 'Active') throw ApiError.badRequest('Only active lists can be completed');
  if (!current.items.some((it) => it.is_purchased)) throw ApiError.badRequest('Tick off at least one purchased item before completing the list');
  const moved = await db.transaction((tx) => grocery.complete(tx, id, userId));
  res.json({ list: await grocery.loadList(q, id, userId), movedToPantry: moved });
}

async function assertOwnList(listId, userId) {
  const [row] = await db.query('SELECT status FROM GroceryLists WHERE list_id = $1 AND user_id = $2', [listId, userId]);
  if (!row) throw ApiError.notFound('Grocery list');
  if (row.status !== 'Active') throw ApiError.badRequest(`Items cannot be changed on a ${row.status.toLowerCase()} list`);
}

async function addItem(req, res) {
  const userId = targetUserId(req);
  const listId = intParam(req.params.id);
  await assertOwnList(listId, userId);
  const d = validate(req.body, {
    ingredient_id: { type: 'int', required: true, min: 1, label: 'Ingredient' },
    quantity_to_buy: { type: 'number', required: true, gt: 0, max: 99999999, label: 'Quantity' },
    estimated_unit_price: { type: 'number', min: 0, max: 99999999, label: 'Unit price' },
  });
  const [ing] = await db.query('SELECT estimated_unit_price FROM Ingredients WHERE ingredient_id = $1', [d.ingredient_id]);
  if (!ing) throw ApiError.badRequest('Unknown ingredient');
  await db.query(
    `INSERT INTO ListItems (list_id, ingredient_id, quantity_to_buy, estimated_unit_price) VALUES ($1, $2, $3, $4)
     ON CONFLICT (list_id, ingredient_id) DO UPDATE SET quantity_to_buy = ListItems.quantity_to_buy + EXCLUDED.quantity_to_buy`,
    [listId, d.ingredient_id, d.quantity_to_buy, d.estimated_unit_price ?? ing.estimated_unit_price],
  );
  res.status(201).json({ list: await grocery.loadList(q, listId, userId) });
}

async function updateItem(req, res) {
  const userId = targetUserId(req);
  const listId = intParam(req.params.id);
  const itemId = intParam(req.params.itemId, 'itemId');
  await assertOwnList(listId, userId);
  const d = validate(req.body, {
    quantity_to_buy: { type: 'number', gt: 0, max: 99999999, label: 'Quantity' },
    estimated_unit_price: { type: 'number', min: 0, max: 99999999, label: 'Unit price' },
    is_purchased: { type: 'boolean', label: 'Purchased' },
  }, { partial: true });
  const cols = Object.keys(d);
  const rows = await db.query(
    `UPDATE ListItems SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}
      WHERE item_id = $1 AND list_id = $2 RETURNING item_id`,
    [itemId, listId, ...cols.map((c) => d[c])],
  );
  if (!rows.length) throw ApiError.notFound('List item');
  res.json({ list: await grocery.loadList(q, listId, userId) });
}

async function removeItem(req, res) {
  const userId = targetUserId(req);
  const listId = intParam(req.params.id);
  const itemId = intParam(req.params.itemId, 'itemId');
  await assertOwnList(listId, userId);
  const rows = await db.query('DELETE FROM ListItems WHERE item_id = $1 AND list_id = $2 RETURNING item_id', [itemId, listId]);
  if (!rows.length) throw ApiError.notFound('List item');
  res.json({ list: await grocery.loadList(q, listId, userId) });
}

// XML web service: GET /api/grocery-lists/:id/xml
async function xml(req, res) {
  const list = await grocery.loadList(q, intParam(req.params.id), targetUserId(req));
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type('application/xml').send(groceryListToXml(list, baseUrl));
}

module.exports = {
  list, getOne, create, update, remove, preview, generate, complete, addItem, updateItem, removeItem, xml,
};
