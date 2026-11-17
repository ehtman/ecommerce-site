// The Express app: global middleware + route mounting.
// It does NOT start listening (server.js does that) so tests and Vercel can import it.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';

import env from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import notFound from './middleware/notFound.middleware.js';
import errorHandler from './middleware/error.middleware.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';

const app = express();

app.set('trust proxy', 1); // real client IP behind Vercel/Render proxies (for rate limiting)

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URLS }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(mongoSanitize()); // removes keys starting with $ or containing . (NoSQL injection)
app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use('/api', apiLimiter);

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'ok',
    data: {
      status: 'ok',
      environment: env.NODE_ENV,
      database: DB_STATES[mongoose.connection.readyState] || 'unknown',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
import { protect, authorize, requireVerifiedEmail } from './middleware/auth.middleware.js';

app.get('/api/test/admin', protect, authorize('admin'), (req, res) =>
  res.json({ ok: true, role: req.user.role })
);

app.get('/api/test/customer', protect, authorize('customer'), (req, res) =>
  res.json({ ok: true, role: req.user.role })
);

app.get('/api/test/verified', protect, authorize('customer'), requireVerifiedEmail, (req, res) =>
  res.json({ ok: true })
);

app.use(notFound);
app.use(errorHandler); // always last

export default app;
