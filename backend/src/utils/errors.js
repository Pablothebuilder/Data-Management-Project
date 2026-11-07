// Error type used throughout the backend. The central error handler turns it
// into a JSON response: { error: { status, message, details? } }.
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) { return new ApiError(400, message, details); }
  static unauthorized(message = 'Please log in first') { return new ApiError(401, message); }
  static forbidden(message = 'You do not have permission to do that') { return new ApiError(403, message); }
  static notFound(what = 'Resource') { return new ApiError(404, `${what} not found`); }
  static conflict(message) { return new ApiError(409, message); }
  static badGateway(message) { return new ApiError(502, message); }
}

// Wraps an async route handler so rejected promises reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, asyncHandler };
