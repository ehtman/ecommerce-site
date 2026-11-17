export const ROLES = Object.freeze({ CUSTOMER: 'customer', ADMIN: 'admin' });
export const AUTH_PROVIDERS = Object.freeze({ LOCAL: 'local', GOOGLE: 'google' });

export const TOKEN_TTL = Object.freeze({
  EMAIL_VERIFY_MS: 24 * 60 * 60 * 1000,   // 24 hours
  PASSWORD_RESET_MS: 30 * 60 * 1000,      // 30 minutes
});

export const REGEX = Object.freeze({
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
});
