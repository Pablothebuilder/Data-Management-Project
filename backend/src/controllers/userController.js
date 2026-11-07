// Users CRUD. Admins manage every account; users can view and edit their own profile.
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const { hashPassword } = require('../utils/password');
const { currentUser } = require('../middleware/auth');
const { PASSWORD_RULE } = require('./authController');

const ROLES = ['Admin', 'User', 'Guest'];
const PUBLIC_COLUMNS = 'user_id, name, email, role, weekly_budget_limit, target_calories, created_at';

const userSchema = {
  name: { type: 'string', required: true, maxLength: 100, label: 'Name' },
  email: { type: 'email', required: true, maxLength: 100, label: 'Email' },
  role: { type: 'enum', values: ROLES, default: 'User', label: 'Role' },
  weekly_budget_limit: { type: 'number', required: true, min: 0, max: 99999999, label: 'Weekly budget' },
  target_calories: { type: 'int', min: 1, max: 20000, nullable: true, label: 'Target calories' },
  password: PASSWORD_RULE,
};

const SORTABLE = { name: 'name', email: 'email', role: 'role', budget: 'weekly_budget_limit', id: 'user_id' };

// Admin user table. Activity columns come from View 10 (v_user_activity_summary).
async function list(req, res) {
  const where = [];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (req.query.role) {
    params.push(req.query.role);
    where.push(`u.role = $${params.length}`);
  }
  const sort = SORTABLE[req.query.sort] || 'user_id';
  const rows = await db.query(
    `SELECT u.user_id, u.name, u.email, u.role, u.weekly_budget_limit, u.target_calories, u.created_at,
            a.pantry_items, a.meals_next_7_days, a.active_lists, a.recipes_authored
       FROM Users u JOIN v_user_activity_summary a ON a.user_id = u.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.${sort}`,
    params,
  );
  res.json({ users: rows });
}

async function getOne(req, res) {
  const id = intParam(req.params.id);
  const [row] = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM Users WHERE user_id = $1`, [id]);
  if (!row) throw ApiError.notFound('User');
  res.json({ user: row });
}

async function create(req, res) {
  const data = validate(req.body, userSchema);
  const [row] = await db.query(
    `INSERT INTO Users (name, email, role, weekly_budget_limit, target_calories, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PUBLIC_COLUMNS}`,
    [data.name, data.email, data.role, data.weekly_budget_limit, data.target_calories ?? null, await hashPassword(data.password)],
  );
  res.status(201).json({ user: row });
}

// Shared by admin update and "update my profile".
async function applyUpdate(id, body, { allowRole }) {
  const schema = { ...userSchema, password: { ...PASSWORD_RULE, required: false } };
  if (!allowRole) delete schema.role;
  const data = validate(body, schema, { partial: true });
  if (data.password) {
    data.password_hash = await hashPassword(data.password);
    delete data.password;
  }
  const columns = Object.keys(data);
  const sets = columns.map((c, i) => `${c} = $${i + 2}`);
  const [row] = await db.query(
    `UPDATE Users SET ${sets.join(', ')} WHERE user_id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, ...columns.map((c) => data[c])],
  );
  if (!row) throw ApiError.notFound('User');
  return row;
}

async function update(req, res) {
  const id = intParam(req.params.id);
  const me = currentUser(req);
  if (id === me.user_id && req.body.role && req.body.role !== 'Admin') {
    throw ApiError.badRequest('You cannot remove your own Admin role');
  }
  res.json({ user: await applyUpdate(id, req.body, { allowRole: true }) });
}

async function remove(req, res) {
  const id = intParam(req.params.id);
  if (id === currentUser(req).user_id) throw ApiError.badRequest('You cannot delete your own account while logged in');
  const rows = await db.query('DELETE FROM Users WHERE user_id = $1 RETURNING user_id', [id]);
  if (!rows.length) throw ApiError.notFound('User');
  res.json({ deleted: id });
}

async function getProfile(req, res) {
  const me = currentUser(req);
  if (!me.user_id) return res.json({ user: me });
  const [row] = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM Users WHERE user_id = $1`, [me.user_id]);
  return res.json({ user: row });
}

async function updateProfile(req, res) {
  const me = currentUser(req);
  const row = await applyUpdate(me.user_id, req.body, { allowRole: false });
  req.session.user = { ...me, name: row.name, email: row.email };
  res.json({ user: row });
}

module.exports = { list, getOne, create, update, remove, getProfile, updateProfile };
