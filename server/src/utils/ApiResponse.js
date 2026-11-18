/**
 * src/utils/ApiResponse.js – sends every SUCCESS response in the same shape.
 *
 * Shape: { success: true, message: string, data: any, meta?: object }
 * WHY:  A predictable "API contract" means the frontend can always read `response.data.data`
 *       without guessing. Errors have a matching shape: { success: false, message, errors? }.
 */
export function sendSuccess(res, statusCode, message, data = null, meta = undefined) {
  const body = { success: true, message, data }; // the standard envelope
  if (meta) body.meta = meta; // `meta` is for extras such as pagination info
  return res.status(statusCode).json(body); // set the status and send JSON
}
