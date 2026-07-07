import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { register, login, refresh, logout, getMe } from '../controllers/auth.controller.js';

const router = Router();

const credentialsSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(256),
});

const registerSchema = credentialsSchema.refine((b) => !!b.name, {
  message: 'name is required',
  path: ['name'],
});

router.post('/register', validateRequest(registerSchema), register);
router.post('/login', validateRequest(credentialsSchema), login);
router.post('/refresh', refresh);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

export default router;
