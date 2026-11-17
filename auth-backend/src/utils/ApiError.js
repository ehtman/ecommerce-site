// An Error that also carries an HTTP status code and optional field errors.
// Usage: throw new ApiError(404, 'Product not found');
export default class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
