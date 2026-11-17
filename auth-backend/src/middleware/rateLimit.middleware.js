import rateLimit from 'express-rate-limit';

const FIFTEEN_MIN = 15 * 60 * 1000;
const message = { success: false, message: 'Too many attempts, try again later' };

const make = (max, windowMs = FIFTEEN_MIN) =>
  rateLimit({ windowMs, max, message, standardHeaders: true, legacyHeaders: false });

export const apiLimiter = make(300);                    // all /api routes
export const authLimiter = make(10);                    // login, register
export const adminLoginLimiter = make(5);               // admin login
export const emailLimiter = make(5, 60 * 60 * 1000);    // resend / forgot password (per hour)
