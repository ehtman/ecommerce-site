/**
 * src/app.js – builds the Express application: global middleware + routes.
 *
 * It does NOT call app.listen(). server.js does that. Keeping them apart means tests
 * (Supertest) and Vercel can import the app without opening a network port.
 *
 * ORDER MATTERS. Every request flows through these lines from top to bottom:
 *   security headers → CORS → [Stripe webhook, raw body] → body parsing → sanitizing → logging → rate limit
 *   → routes → 404 → error handler
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';

import env from './config/env.js';
import openapiSpec from './docs/openapi.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import notFound from './middleware/notFound.middleware.js';
import errorHandler from './middleware/error.middleware.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import addressRoutes from './modules/addresses/address.routes.js';
import categoryRoutes from './modules/categories/category.routes.js';
import productRoutes from './modules/products/product.routes.js';
import uploadRoutes from './modules/uploads/upload.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import wishlistRoutes from './modules/wishlist/wishlist.routes.js';
import couponRoutes from './modules/coupons/coupon.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import { stripeWebhook } from './modules/payments/payment.controller.js';
import reviewRoutes from './modules/reviews/review.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

const app = express();

// Behind a proxy (Vercel, Render, Nginx) the real client IP is in X-Forwarded-For.
// Trusting ONE proxy hop makes rate limiting count real users, not the proxy.
app.set('trust proxy', 1);

// ---------- Global middleware ----------
app.use(helmet()); // sets safe HTTP headers (e.g. stops our pages being put in iframes)
app.use(cors({ origin: env.CLIENT_URLS })); // only our frontend(s) may call us from a browser

// ---------- Stripe webhook (MUST come before express.json) ----------
// Stripe signs the EXACT bytes it sends. express.json() would turn them into an object, and
// re-serialising that object never gives back the identical bytes, so the signature check
// would always fail. express.raw() keeps the body as a Buffer for this one route only.
// It also sits before the rate limiter: Stripe's retries must never be blocked with 429.
// (docs/concepts/22-webhooks-signatures-idempotency.md)
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '100kb' })); // parse JSON bodies; refuse huge ones
app.use(express.urlencoded({ extended: true, limit: '100kb' })); // parse HTML-form bodies
// Removes keys starting with "$" or containing "." from input. That blocks NoSQL
// injection such as { "email": { "$ne": null } } ("any email that is not null").
app.use(mongoSanitize());
// Log one line per request (method, URL, status, time). Quiet during tests.
if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use('/api', apiLimiter); // general rate limit for every /api route

// ---------- Health check ----------
// Used by hosting platforms and monitoring tools to ask "are you alive?"
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'ok',
    data: {
      status: 'ok',
      environment: env.NODE_ENV,
      database: DB_STATES[mongoose.connection.readyState] || 'unknown',
      cardPaymentsEnabled: env.PAYMENT_CARD_ENABLED, // lets the frontend hide the card option
    },
  });
});

// ---------- API documentation (Swagger UI) ----------
// Open http://localhost:5000/api/docs to read and TRY every endpoint in the browser.
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec)); // raw spec (Postman can import it)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// ---------- Feature routes (one line per module) ----------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/categories', categoryRoutes); // public reads + admin writes
app.use('/api/products', productRoutes);
app.use('/api/uploads', uploadRoutes); // admin image uploads (multipart → Cloudinary)
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes); // edit/delete/moderate one review (list/create: /api/products/:id/reviews)
app.use('/api/admin', adminRoutes); // admin only: guarded inside the router

// ---------- Fallbacks (must be LAST) ----------
app.use(notFound); // no route matched → 404
app.use(errorHandler); // every error ends here → consistent JSON

export default app;
