// Session-based authentication and role-based access control.
//
// Roles (stored in Users.role):
//   Admin - everything, including user management and editing the shared catalog
//   User  - manages their own pantry, meal plans, grocery lists and recipes
//   Guest - read-only: can browse ingredients, recipes, views and charts
const { ApiError } = require('../utils/errors');

function currentUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}

// API guard: 401 when not logged in.
function requireAuth(req, res, next) {
  if (!currentUser(req)) return next(ApiError.unauthorized());
  return next();
}

// API guard: 403 when logged in with the wrong role.
function requireRole(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) {
      return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
}

// Writers are any logged-in account that is not a Guest.
const requireWriter = requireRole('Admin', 'User');
const requireAdmin = requireRole('Admin');

// Page guard: redirects browsers instead of returning JSON.
function pageGuard(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (roles.length && !roles.includes(user.role)) return res.redirect('/?denied=1');
    return next();
  };
}

// Resolves whose data a request targets. Admins may pass ?userId= to act on
// another user's data; everybody else always gets their own user_id.
function targetUserId(req) {
  const user = currentUser(req);
  if (user.role === 'Admin' && req.query.userId) {
    const id = Number(req.query.userId);
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('userId must be a positive integer');
    return id;
  }
  if (!user.user_id) throw ApiError.forbidden('Guests do not have personal data. Create an account to use this feature.');
  return user.user_id;
}

module.exports = { currentUser, requireAuth, requireRole, requireWriter, requireAdmin, pageGuard, targetUserId };
