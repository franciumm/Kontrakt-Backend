import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import router from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimiter.js';
import { config } from './config/index.js';

function corsOptions() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return {
      origin: [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/],
      credentials: false,
    };
  }
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return { origin: origins, credentials: false };
}

export function createApp() {
  const app = express();

  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Rate limit is global — applies to every route. In test mode we skip it
  // so the suite can fire many requests without artificially throttling.
  if (config.nodeEnv !== 'test') {
    app.use(rateLimit({ windowMs: 60_000, max: 30 }));
  }

  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api', router);
  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'Kontrakt Backend API' });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
