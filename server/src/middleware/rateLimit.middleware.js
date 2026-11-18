/**
 * src/middleware/rateLimit.middleware.js – limits how many requests one IP can make.
 *
 * WHY: Without limits an attacker can try thousands of passwords per minute
 *      ("brute force") or flood us with emails. After the limit the client gets
 *      429 Too Many Requests until the time window resets.
 *
 * NOTE: counts are kept in this server's memory. That is fine for one server. With many
 *       servers you would store counts in a shared place such as Redis.
 */
import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

const FIFTEEN_MIN = 15 * 60 * 1000; // time window in milliseconds
// The body sent with a 429 response (same shape as our other errors)
const message = { success: false, message: 'Too many attempts, try again later' };

// Small factory so each limiter is one readable line below
const make = (max, windowMs = FIFTEEN_MIN) =>
  rateLimit({
    windowMs, // length of the window
    max, // allowed requests per IP inside the window
    message,
    standardHeaders: true, // send RateLimit-* headers so clients can see their quota
    legacyHeaders: false, // don't send the old X-RateLimit-* headers
    skip: () => !env.RATE_LIMIT_ENABLED, // RATE_LIMIT_ENABLED=false turns all limits off
  });

export const apiLimiter = make(300); // every /api route: 300 per 15 min
export const authLimiter = make(10); // login, register, reset: 10 per 15 min
export const adminLoginLimiter = make(5); // admin login is a bigger target: 5 per 15 min
export const emailLimiter = make(5, 60 * 60 * 1000); // emails we send: 5 per hour
