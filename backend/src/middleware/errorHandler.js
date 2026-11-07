// Central error handling: every error thrown in a route ends up here and is
// returned as JSON with a sensible HTTP status code.
const { ApiError } = require('../utils/errors');

// PostgreSQL SQLSTATE codes -> HTTP responses users can understand.
const PG_ERRORS = {
  23505: [409, 'A record with these values already exists'],
  23503: [409, 'This record is referenced by, or refers to, a record that does not exist'],
  23514: [400, 'A value is outside the allowed range'],
  23502: [400, 'A required value is missing'],
  '22P02': [400, 'A value has the wrong data type'],
  22003: [400, 'A number is too large'],
  22001: [400, 'A text value is too long'],
  22007: [400, 'Invalid date or time value'],
  22008: [400, 'Date or time value out of range'],
};

// Errors that mean the database itself is unavailable.
const CONNECTION_ERRORS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'DB_NOT_CONNECTED',
  '57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004']);

function notFoundApi(req, res, next) {
  next(new ApiError(404, `No API endpoint ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Something went wrong on the server';
  let details;

  if (err instanceof ApiError) {
    ({ status, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (CONNECTION_ERRORS.has(err.code)) {
    status = 503;
    message = 'The database is unavailable. Please try again shortly.';
  } else if (err.code && PG_ERRORS[err.code]) {
    [status, message] = PG_ERRORS[err.code];
    if (err.constraint) details = [{ constraint: err.constraint }];
  }

  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

  if (res.headersSent) return res.end();
  return res.status(status).json({ error: { status, message, ...(details ? { details } : {}) } });
}

module.exports = { errorHandler, notFoundApi };
