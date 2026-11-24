/**
 * src/modules/payments/cron.middleware.js – lets only the SCHEDULER run background jobs.
 *
 * WHAT IS A CRON JOB? A task a scheduler runs on a timetable ("every day at 03:00").
 * The name comes from `cron`, the classic Unix scheduler, and its 5-field time format:
 *   "0 3 * * *" = minute 0, hour 3, every day, every month, every weekday.
 * On Vercel there is no always-running server, so the scheduler (Vercel Cron, see
 * server/vercel.json) simply calls a URL of our API. That URL must not be callable by
 * strangers, so the caller has to present a shared secret (CRON_SECRET):
 *   - header `x-cron-secret: <secret>`            (curl, Postman, other schedulers)
 *   - header `Authorization: Bearer <secret>`     (what Vercel Cron sends automatically)
 *
 * Answers: 401 = no secret sent, 403 = secret sent but wrong (or no secret configured).
 */
import crypto from 'node:crypto';
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Compares two strings in "constant time". A normal `===` stops at the first different
 * character, so an attacker measuring response times could guess a secret letter by
 * letter. timingSafeEqual always looks at every byte. (It needs equal lengths, so we
 * check the length first; that only reveals the length, not the secret.)
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireCronSecret(req, _res, next) {
  // Prefer our own header; fall back to "Authorization: Bearer <secret>" (Vercel Cron)
  const auth = req.headers.authorization || '';
  const sent = req.headers['x-cron-secret'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!sent) return next(new ApiError(401, 'Cron secret missing'));
  // No secret configured on the server = the job is switched off; nothing can match
  if (!env.CRON_SECRET || !safeEqual(sent, env.CRON_SECRET)) {
    return next(new ApiError(403, 'Invalid cron secret'));
  }
  next(); // the caller is our scheduler → run the job
}
