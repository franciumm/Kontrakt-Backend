import { Router } from 'express';
import { concurrencyCap } from '../middleware/concurrency.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth, extractTokenGate } from '../middleware/auth.js';
import { auditTextSchema, extractBase64Schema } from '../validators/audit.schema.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { extractPdfText, analyzeContract, fastScanContract, getAuditHistory, getAuditById } from '../controllers/audit.controller.js';

const router = Router();

// Per-process cap on concurrent heavy Vision work (ticket SEC-104).
// Over-cap requests get 503 + Retry-After.
const extractConcurrency = concurrencyCap({ max: 3, retryAfterSec: 10 });

// Auth is required on ALL audit endpoints — unauthenticated access was a bug.

// 1. Step One: Extract text from PDF using Vision OCR (Two-Step Flow).
//    The client uploads an array of base64 JPEG/PNG images representing PDF pages.
//    We validate the size and count of images to prevent DoS before calling Vision.
router.post('/extract', requireAuth, validateRequest(extractBase64Schema), extractConcurrency, extractPdfText);

// 2. Step Two: Run deep audit on the user-approved text.
//    Body validation first (so missing/oversize bodies still return 400), then
//    the extract-token gate binds the submitted text to a prior /extract call.
router.post('/analyze', requireAuth, validateRequest(auditTextSchema), extractTokenGate, analyzeContract);

// 3. Optional: Fast stream scan.
router.post('/fast-scan', requireAuth, validateRequest(auditTextSchema), fastScanContract);

// 4. History: paginated list of user's past audits.
router.get('/history', requireAuth, getAuditHistory);

// 5. Detail: single audit by ID.
router.get('/:id', requireAuth, validateObjectIdParam('id'), getAuditById);

export default router;
