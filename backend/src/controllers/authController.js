// Login / logout / registration using server-side sessions (express-session).
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate } = require('../utils/validate');
const { hashPassword, verifyPassword } = require('../utils/password');
const { currentUser } = require('../middleware/auth');

const PASSWORD_RULE = { type: 'string', required: true, minLength: 8, maxLength: 100, label: 'Password' };

function toSessionUser(row) {
  return { user_id: row.user_id, name: row.name, email: row.email, role: row.role };
}

// Regenerating the session id on login prevents session fixation attacks.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = user;
      return req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

async function login(req, res) {
  const { email, password } = validate(req.body, {
    email: { type: 'email', required: true, label: 'Email' },
    password: { type: 'string', required: true, label: 'Password' },
  });
  const [row] = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
  // Same message for unknown email and wrong password so accounts can't be probed.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new ApiError(401, 'Incorrect email or password');
  }
  const user = toSessionUser(row);
  await startSession(req, user);
  res.json({ user });
}

async function guestLogin(req, res) {
  const user = { user_id: null, name: 'Guest', email: null, role: 'Guest' };
  await startSession(req, user);
  res.json({ user });
}

async function register(req, res) {
  const data = validate(req.body, {
    name: { type: 'string', required: true, maxLength: 100, label: 'Name' },
    email: { type: 'email', required: true, maxLength: 100, label: 'Email' },
    password: PASSWORD_RULE,
    weekly_budget_limit: { type: 'number', required: true, min: 0, max: 99999999, label: 'Weekly budget' },
    target_calories: { type: 'int', min: 1, max: 20000, nullable: true, label: 'Target calories' },
  });
  const passwordHash = await hashPassword(data.password);
  // Self-registration always creates a regular User; only admins grant Admin.
  const [row] = await db.query(
    `INSERT INTO Users (name, email, role, weekly_budget_limit, target_calories, password_hash)
     VALUES ($1, $2, 'User', $3, $4, $5) RETURNING *`,
    [data.name, data.email, data.weekly_budget_limit, data.target_calories ?? null, passwordHash],
  ).catch((err) => {
    if (err.code === '23505') throw ApiError.conflict('An account with this email already exists');
    throw err;
  });
  const user = toSessionUser(row);
  await startSession(req, user);
  res.status(201).json({ user });
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('nutricart.sid');
    return res.json({ ok: true });
  });
}

function me(req, res) {
  res.json({ user: currentUser(req) });
}

module.exports = { login, guestLogin, register, logout, me, PASSWORD_RULE };
