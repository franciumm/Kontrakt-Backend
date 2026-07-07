import { convertPdfToImages } from '../services/pdf.service.js';
import { transcribeImages } from '../services/vision.service.js';
import { deepAuditContract, fastFirstPassScan } from '../services/audit.service.js';
import { signExtractToken } from '../services/extractToken.js';
import { logger } from '../utils/logger.js';

/**
 * Endpoint: POST /api/audit/extract
 * Extracts text from an uploaded PDF, using Vision to defeat image-based text traps.
 *
 * The two-step design (extract → user approves → analyze) is deliberate:
 * Vision OCR catches traps that copy-paste would miss, and the user-confirmation
 * step keeps the OCR layer from becoming an injection vector.
 */
export async function extractPdfText(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    // 1. Convert PDF pages → base64 JPEGs (validates magic bytes, page cap, etc.)
    const { images, pageCount } = await convertPdfToImages(req.file.buffer);

    // 2. Transcribe via Vision model (per-page boundary markers, retry on transient)
    const { text, truncated } = await transcribeImages(images);

    // 3. Mint a short-lived token binding this exact text (ticket SEC-108).
    //    /analyze will reject any text whose hash doesn't match, so a user
    //    cannot "prove" a different contract is clean using this extraction.
    const extractToken = signExtractToken(text);

    return res.status(200).json({
      success: true,
      text,
      extractToken,
      pageCount,
      truncated,
      message: 'Please review the extracted text to ensure accuracy before auditing.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/audit/analyze
 * Accepts user-approved text and runs the deep audit (5 security layers).
 */
export async function analyzeContract(req, res, next) {
  // Body validated by `validateRequest(auditTextSchema)` upstream.
  try {
    const { contractText, preset } = req.body;
    const auditResult = await deepAuditContract(contractText, preset ? { preset } : {});
    return res.status(200).json({ success: true, data: auditResult });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/audit/fast-scan
 * Streams the fast-first-pass trap count as a JSON token stream.
 *
 * Errors raised before the first write go through next(error). Errors raised
 * mid-stream cannot propagate cleanly (headers already sent) — we log them
 * and tear down the connection. Writing a JSON sentinel `{ "error": "..." }`
 * would corrupt the partial schema-compliant JSON already on the wire.
 */
export async function fastScanContract(req, res, next) {
  const { contractText } = req.body;
  let stream;
  try {
    stream = await fastFirstPassScan(contractText);
  } catch (error) {
    return next(error);
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  try {
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) res.write(content);
    }
    res.end();
  } catch (error) {
    // Headers sent — cannot swap to a JSON error. Best effort: log + destroy
    // the socket. Guard against the narrow case where res.end() already
    // queued a destroy — calling destroy(error) twice on the same response
    // emits ERR_STREAM_DESTROYED.
    logger.error('[fast-scan] stream error', { message: error.message });
    if (!res.writableEnded) res.destroy(error);
    else res.destroy();
  }
}
