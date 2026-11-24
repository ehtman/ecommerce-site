/**
 * src/config/env.js – the ONE place that reads environment variables.
 *
 * WHAT: Loads `.env`, checks the required values exist, and exports a clean `env` object.
 * WHY:  "12-factor config": settings (secrets, URLs, ports) live OUTSIDE the code, so the
 *       same code runs on your laptop, in tests and in production with different values.
 *       Reading process.env in one file means a typo is fixed once, not in 20 places.
 * USED BY: almost every file that needs a setting (db.js, sendEmail.js, generateToken.js…).
 */
import dotenv from 'dotenv'; // dotenv copies the lines of `.env` into process.env

// Read `.env` from the folder you start node in (the `server/` folder).
// `quiet: true` stops dotenv from printing a log line on every start.
dotenv.config({ quiet: true });

// Without these two the app cannot work at all, so we refuse to start ("fail fast").
const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];
// Keep only the names whose value is missing or empty
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  // A clear message now is much better than a confusing crash later
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in the values.');
  process.exit(1); // exit code 1 = "stopped because of an error"
}

// Build one object with every setting. `||` gives a safe default when a value is not set.
const env = {
  // ---------- App ----------
  NODE_ENV: process.env.NODE_ENV || 'development', // development | test | production
  PORT: Number(process.env.PORT) || 5000, // env values are strings → convert to a number
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173', // the React app's address

  // ---------- Database ----------
  MONGO_URI: process.env.MONGO_URI, // connection string (Atlas, or the in-memory test DB)

  // ---------- Auth ----------
  JWT_SECRET: process.env.JWT_SECRET, // signs login tokens – keep it long and secret
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d', // how long a login token is valid

  // ---------- Seed admin (npm run seed:admin) ----------
  ADMIN_NAME: process.env.ADMIN_NAME || 'Store Admin',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@shopease.pk').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin12345',

  // ---------- Email (Mailpit in development) ----------
  SMTP_HOST: process.env.SMTP_HOST || 'localhost',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 1025, // Mailpit's SMTP port
  SMTP_USER: process.env.SMTP_USER || '', // empty = no login (Mailpit needs none)
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'ShopEase <no-reply@shopease.pk>',

  // ---------- Google login (optional) ----------
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '', // empty = Google login disabled

  // ---------- Cloudinary image hosting (optional) ----------
  // Cloudinary stores our product images and serves them from a fast CDN. All three values
  // come from Cloudinary → Dashboard → API keys. Empty = uploads answer 500 "not configured"
  // (everything else still works). See docs/concepts/17-file-uploads-and-cdn.md.
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '', // your account's name in URLs
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '', // public part of the key pair
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '', // SECRET: never commit it

  // ---------- Rate limiting ----------
  // Only the exact text "false" turns limits off (handy for repeated Postman runs and tests).
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED !== 'false',

  // ---------- Card payments with Stripe (optional, branch 08) ----------
  // A feature flag: only the exact text "true" turns card payments on. Off by default, so
  // the shop works with Cash on Delivery alone until you have Stripe keys.
  PAYMENT_CARD_ENABLED: process.env.PAYMENT_CARD_ENABLED === 'true',
  // Secret API key (sk_test_… in test mode). Lets OUR server talk to Stripe. Never send it
  // to the browser: whoever has it can create charges and refunds on your account.
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  // Webhook signing secret (whsec_…). Stripe signs every webhook with it; we check the
  // signature so nobody else can pretend to be Stripe. See docs/concepts/22-*.md
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  // Shared password the scheduler (Vercel Cron) sends to run the "expire unpaid orders"
  // job. Empty = the job endpoint refuses every call.
  CRON_SECRET: process.env.CRON_SECRET || '',
};

// CLIENT_URL may hold several URLs separated by commas (e.g. localhost + the live site).
// We split it into an array for CORS…
env.CLIENT_URLS = env.CLIENT_URL.split(',').map((u) => u.trim());
// …and use the FIRST one to build links inside emails.
env.FRONTEND_URL = env.CLIENT_URLS[0];
// Handy true/false flags so other files don't compare strings every time
env.isProduction = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';

export default env;
