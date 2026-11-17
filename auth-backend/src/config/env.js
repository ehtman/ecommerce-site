// Reads every environment variable the app needs in ONE place.
// If a required variable is missing, the server stops with a clear message.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',

  ADMIN_NAME: process.env.ADMIN_NAME || 'Store Admin',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@shopease.pk',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin12345',

  SMTP_HOST: process.env.SMTP_HOST || 'localhost',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 1025,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'ShopEase <no-reply@shopease.pk>',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
};

// CLIENT_URL may hold several URLs separated by commas
env.CLIENT_URLS = env.CLIENT_URL.split(',').map((u) => u.trim());
// The first one is used to build links in emails
env.FRONTEND_URL = env.CLIENT_URLS[0];
env.isProduction = env.NODE_ENV === 'production';

export default env;
