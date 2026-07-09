import { Router } from 'express';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import contractRoutes from './contract.routes.js';

import { getHealthStatus } from '../services/health.service.js';

const router = Router();

// Mount the audit routes under /api/audit
router.use('/audit', auditRoutes);

// Auth (register/login/refresh/logout/me) — ticket SEC-108 identity layer.
router.use('/auth', authRoutes);

// Contract interrogator (start/answer/generate/report/history).
router.use('/contract', contractRoutes);

// Job state polling fallback.
import jobRoutes from './job.routes.js';
router.use('/jobs', jobRoutes);

// Health check endpoint — pass ?deep=1 to verify MongoDB (and Redis when configured).
router.get('/health', async (req, res, next) => {
  try {
    const deep = req.query.deep === '1' || req.query.deep === 'true';
    const status = await getHealthStatus({ deep });
    const code = status.status === 'ok' ? 200 : 503;
    res.status(code).json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
