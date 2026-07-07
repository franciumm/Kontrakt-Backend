import { Router } from 'express';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';

const router = Router();

// Mount the audit routes under /api/audit
router.use('/audit', auditRoutes);

// Auth (register/login/refresh/logout/me) — ticket SEC-108 identity layer.
router.use('/auth', authRoutes);

// Health check endpoint
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'Kontrakt Backend API' });
});

export default router;
