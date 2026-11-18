/**
 * src/utils/asyncHandler.js – lets controllers be `async` without try/catch everywhere.
 *
 * PROBLEM: In Express 4, when an async function throws, Express does NOT notice it and
 *          the request hangs forever.
 * FIX:     Wrap the function: run it, and if its promise rejects, pass the error to
 *          `next(err)`, which sends it to the central error handler.
 *
 * Usage: export const login = asyncHandler(async (req, res) => { ... });
 */
const asyncHandler = (fn) => (req, res, next) =>
  // Promise.resolve(...) also works if `fn` is not async; .catch(next) forwards any error
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
