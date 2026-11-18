/**
 * src/utils/ApiError.js – an Error that also knows its HTTP status code.
 *
 * WHY: Services and controllers simply `throw new ApiError(404, 'User not found')`.
 *      The central error handler (middleware/error.middleware.js) reads `statusCode`
 *      and `errors` and sends the response, so no other file has to build error JSON.
 *
 * Example:  throw new ApiError(400, 'Validation failed', [{ field: 'email', message: '…' }]);
 */
export default class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status, e.g. 400 bad input, 401 not logged in, 404 not found
   * @param {string} message     short human-readable message for the client
   * @param {Array<{field: string, message: string}>} [errors] optional per-field errors
   */
  constructor(statusCode, message, errors = []) {
    super(message); // let the built-in Error store the message (and the stack trace)
    this.statusCode = statusCode; // remembered so the error handler can use it
    this.errors = errors; // list of field errors (empty when not about form fields)
  }
}
