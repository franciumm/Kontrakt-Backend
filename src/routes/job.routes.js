import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getJobStatus } from '../controllers/job.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/:id', getJobStatus);

export default router;
