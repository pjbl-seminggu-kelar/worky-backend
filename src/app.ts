import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middlewares/error.middleware';
import { metrics } from './lib/metrics';

import authRoutes from './routes/auth.route';
import exerciseRoutes from './routes/exercise.route';
import userRoutes from './routes/user.route';
import sessionRoutes from './routes/session.route';
import planRoutes from './routes/plan.route'; // RUTE BARU

// Serialize BigInt ke JSON
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  })
);
app.use(express.json({ limit: '10kb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);

// Root & Health Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Worky Backend API Service is running',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Prometheus Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.getMetricsAsPrometheusText());
});

// Routing API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/exercises', exerciseRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/plans', planRoutes); // DAFTARKAN RUTE PLAN

// Global Error Handler
app.use(errorHandler);

export default app;