// src/routes/contract.routes.js
// Contract interrogator routes — all require authentication.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import {
  startContractSchema,
  answerContractSchema,
  generateContractSchema,
  reportContractSchema,
} from '../validators/contract.schema.js';
import {
  startContractHandler,
  answerContractHandler,
  generateContractHandler,
  generateReportHandler,
  getContractHistory,
  getContractById,
  getContractPresets,
} from '../controllers/contract.controller.js';

const router = Router();

// 1. Start a new contract session — parse gig description, return first questions.
router.post('/start', requireAuth, validateRequest(startContractSchema), startContractHandler);

// 2. Submit answers to questions — returns next questions or done.
router.post('/answer', requireAuth, validateRequest(answerContractSchema), answerContractHandler);

// 3. Generate the final contract text from answered state.
router.post('/generate', requireAuth, validateRequest(generateContractSchema), generateContractHandler);

// 4. Generate the exposure report for a contract.
router.post('/report', requireAuth, validateRequest(reportContractSchema), generateReportHandler);

// 5. History: paginated list of user's contracts (excludes large text fields).
router.get('/history', requireAuth, getContractHistory);

// 6. Presets list
router.get('/presets', requireAuth, getContractPresets);

// 7. Detail: single contract by ID.
router.get('/:id', requireAuth, validateObjectIdParam('id'), getContractById);

export default router;
