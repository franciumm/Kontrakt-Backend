import { AppError } from '../utils/AppError.js';

import { transcribeImages } from '../services/vision.service.js';
import { deepAuditContract, fastFirstPassScan } from '../services/audit.service.js';
import { signExtractToken } from '../services/extractToken.js';
import { jobManager } from '../ws/jobManager.js';
import { OPERATIONS } from '../constants/jobStatus.js';
import { Audit } from '../../DB/models/Audit.Model.js';
import { logger } from '../utils/logger.js';

/**
 * Endpoint: POST /api/audit/extract
 * Extracts text from an uploaded PDF, using Vision to defeat image-based text traps.
 *
 * Returns 202 { jobId }. All results delivered via WebSocket.
 */
export async function extractPdfText(req, res, next) {
  try {
    const { images } = req.body;
    if (!images || !images.length) {
      return next(new AppError('No images provided.', 400));
    }

    const { jobId } = await jobManager.createJob(req.user._id, OPERATIONS.AUDIT_EXTRACT);

    // Return 202 immediately — the client subscribes via WS to get updates.
    res.status(202).json({ jobId });

    // Async processing — not awaited by the HTTP handler.
    (async () => {
      try {
        const pageCount = images.length;
        
        // Transcribe via Vision model
        jobManager.emitStatus(jobId, 'transcribing', { pageCount });
        const { text, truncated } = await transcribeImages(images, (current, total) => {
          jobManager.emitStatus(jobId, 'transcribing_page', { current, total });
        });

        // Mint a short-lived token binding this exact text (ticket SEC-108).
        const extractToken = signExtractToken(text);

        jobManager.completeJob(jobId, {
          text,
          extractToken,
          pageCount,
          truncated,
          message: 'Please review the extracted text to ensure accuracy before auditing.',
        });
      } catch (error) {
        logger.error('[extract] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/audit/analyze
 * Accepts user-approved text and runs the deep audit (5 security layers).
 *
 * Returns 202 { jobId }. All results delivered via WebSocket.
 * On success, saves the audit to MongoDB for the logged-in user.
 */
export async function analyzeContract(req, res, next) {
  try {
    const { contractText, preset } = req.body;
    const userId = req.user._id;

    if (contractText.replace(/\[ILLEGIBLE_PAGE\]/g, '').trim().length === 0) {
      return next(new AppError('Contract text is illegible or completely blank. Please upload a clearer image or provide readable text.', 400));
    }

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.AUDIT_ANALYZE);
    res.status(202).json({ jobId });

    (async () => {
      try {
        const onStatus = (status, data) => jobManager.emitStatus(jobId, status, data);
        const auditResult = await deepAuditContract(contractText, {
          ...(preset ? { preset } : {}),
          onStatus,
        });

        // Persist to MongoDB for audit history.
        try {
          await Audit.create({
            userId,
            originalText: contractText,
            flags: auditResult.flags,
          });
        } catch (dbErr) {
          // DB write failure should not break the audit result delivery.
          logger.error('[analyze] failed to save audit to DB', { message: dbErr.message });
        }

        jobManager.completeJob(jobId, auditResult);
      } catch (error) {
        logger.error('[analyze] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/audit/fast-scan
 * Fast first-pass scan that returns an estimated trap count.
 *
 * Returns 202 { jobId }. Result delivered via WebSocket.
 */
export async function fastScanContract(req, res, next) {
  try {
    const { contractText } = req.body;

    if (contractText.replace(/\[ILLEGIBLE_PAGE\]/g, '').trim().length === 0) {
      return next(new AppError('Contract text is illegible or completely blank. Please upload a clearer image or provide readable text.', 400));
    }

    const { jobId } = await jobManager.createJob(req.user._id, OPERATIONS.AUDIT_FAST_SCAN);
    res.status(202).json({ jobId });

    (async () => {
      try {
        const onStatus = (status) => jobManager.emitStatus(jobId, status);
        const stream = await fastFirstPassScan(contractText, { onStatus });

        // Collect the streamed result into a single string.
        let result = '';
        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) result += content;
        }

        // Parse the JSON result.
        let parsed;
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = { raw: result };
        }

        jobManager.completeJob(jobId, parsed);
      } catch (error) {
        logger.error('[fast-scan] job failed', { jobId, message: error.message });
        jobManager.failJob(jobId, error);
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/audit/history
 * Returns paginated list of the user's past audits.
 */
export async function getAuditHistory(req, res, next) {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [audits, total] = await Promise.all([
      Audit.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Audit.countDocuments({ userId }),
    ]);

    return res.status(200).json({
      success: true,
      data: audits,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/audit/:id
 * Returns a single audit by ID (with ownership check).
 */
export async function getAuditById(req, res, next) {
  try {
    const audit = await Audit.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!audit) {
      return next(new AppError('Audit not found', 404));
    }
    return res.status(200).json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
}
