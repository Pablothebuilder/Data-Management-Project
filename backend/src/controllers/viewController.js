// Executes the 10 Phase II views for the /views page (and for export).
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { currentUser } = require('../middleware/auth');
const registry = require('../services/viewRegistry');

function listViews(req, res) {
  const { role } = currentUser(req);
  res.json({
    views: registry.VIEWS.map((v) => ({ ...v, accessible: registry.canSee(v, role) })),
  });
}

// Runs one view with role-based row filtering. Used by the API and by export.
async function runView(user, nameOrNumber, query = {}) {
  const view = registry.byName(nameOrNumber);
  if (!view) throw ApiError.notFound('View');
  if (!registry.canSee(view, user.role)) {
    throw ApiError.forbidden(user.role === 'Guest'
      ? 'Guests can only see catalog views. Log in to see personal views.'
      : 'Only admins can see this view.');
  }
  const params = [];
  const where = [];
  // Regular users only ever see their own rows in per-user views.
  if (view.scope === 'user' && user.role !== 'Admin') {
    params.push(user.user_id);
    where.push(`user_id = $${params.length}`);
  } else if (view.scope === 'user' && query.userId && Number.isInteger(Number(query.userId))) {
    params.push(Number(query.userId));
    where.push(`user_id = $${params.length}`);
  }
  const rows = await db.query(
    `SELECT * FROM ${view.name} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY 1`,
    params,
  );
  return { view: { ...view, sql: registry.viewSql(view.name) }, rows };
}

async function getView(req, res) {
  res.json(await runView(currentUser(req), req.params.name, req.query));
}

module.exports = { listViews, getView, runView };
