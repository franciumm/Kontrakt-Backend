import { Router } from 'express';
import { pdfUpload } from '../middleware/upload.js';
import { concurrencyCap } from '../middleware/concurrency.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth, extractTokenGate } from '../middleware/auth.js';
import { auditTextSchema, fastScanSchema } from '../validators/audit.schema.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { extractPdfText, analyzeContract, fastScanContract, getAuditHistory, getAuditById } from '../controllers/audit.controller.js';

const router = Router();

// Per-process cap on concurrent heavy PDF→Vision work (ticket SEC-104).
// Over-cap requests get 503 + Retry-After.
const extractConcurrency = concurrencyCap({ max: 3, retryAfterSec: 10 });

// Auth is required on ALL audit endpoints — unauthenticated access was a bug.

// 1. Step One: Extract text from PDF using Vision OCR (Two-Step Flow).
//    pdfUpload runs first; on a LIMIT_FILE_SIZE / wrong-mimetype violation it
//    forwards a MulterError to errorHandler (which maps it to 400). The
//    concurrency cap sits between upload and the heavy conversion so an
//    accepted-but-throttled request still releases its multer buffer on 503.
router.post('/extract', requireAuth, pdfUpload.single('contractFile'), extractConcurrency, extractPdfText);

// 2. Step Two: Run deep audit on the user-approved text.
//    Body validation first (so missing/oversize bodies still return 400), then
//    the extract-token gate binds the submitted text to a prior /extract call.
router.post('/analyze', requireAuth, validateRequest(auditTextSchema), extractTokenGate, analyzeContract);

// 3. Optional: Fast stream scan.
router.post('/fast-scan', requireAuth, validateRequest(fastScanSchema), fastScanContract);

// 4. History: paginated list of user's past audits.
router.get('/history', requireAuth, getAuditHistory);

// 5. Detail: single audit by ID.
router.get('/:id', requireAuth, validateObjectIdParam('id'), getAuditById);

export default router;
