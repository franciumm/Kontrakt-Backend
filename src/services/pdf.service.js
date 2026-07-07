// Memory-safe PDF renderer (ticket SEC-102, option C).
//
// Previously this module used `pdf2pic`, which shells out to ghostscript
// without `-dSAFER` — exposing an RCE / decompression-bomb surface on the
// host. This implementation uses `pdfjs-dist` (Mozilla's pure-JS PDF engine,
// the same one Firefox ships) plus `@napi-rs/canvas` (prebuilt, no native
// system deps) to render pages to JPEGs entirely in-process. No subprocess,
// no ghostscript, no graphicsmagick.
//
// Interface preserved verbatim: `convertPdfToImages(buffer)` →
// `{ images: string[], pageCount: number }`, where each image is a Base64
// JPEG. Same hard caps (10 pages, 8 MB cumulative render budget).

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { logger } from '../utils/logger.js';

// Resolve the worker once. Using `require.resolve` makes this robust across
// dev, prod, and test layouts without depending on the consumer's CWD.
const require = createRequire(import.meta.url);
try {
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
} catch {
  // Worker bundle missing — pdfjs falls back to a fake main-thread worker.
  // Functional, just slower and logs a warning.
}

// Hard caps — the audit flow only needs the first chunk of a contract.
export const MAX_PAGES = 10;
const DPI = 200; // 200 DPI is sufficient for OCR/Vision without ballooning payload size.
// Defensive cap on the total base64 payload we hand to the Vision model —
// protects against pathological PDFs (mostly-image, high-entropy pages).
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MB of base64 across all pages combined.

// PDF magic bytes — `%PDF-`. Mimetype alone is spoofable, so we confirm the
// buffer itself looks like a PDF before handing it to the renderer.
const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * Rejects buffers that don't start with the `%PDF-` magic header. Catches
 * renamed images / zip files that pass multer's mimetype check.
 */
function assertPdfMagic(buffer) {
  if (!buffer || buffer.length < 5) {
    const err = new Error('File is too small to be a valid PDF.');
    err.statusCode = 400;
    throw err;
  }
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buffer[i] !== PDF_MAGIC[i]) {
      const err = new Error('File does not have a valid PDF header. Upload rejected.');
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * Validates a PDF and converts all its pages to Base64 JPEG strings.
 *
 * Page dimensions come from pdfjs's viewport, so Letter / Legal / Tabloid /
 * custom-size PDFs are not distorted.
 *
 * @param {Buffer} pdfBuffer - The uploaded PDF file buffer.
 * @returns {Promise<{ images: string[], pageCount: number }>}
 */
export async function convertPdfToImages(pdfBuffer) {
  assertPdfMagic(pdfBuffer);

  // 1. Reject encrypted / corrupted PDFs early via pdf-lib (keeps the error
  //    message stable across the renderer swap). pdfjs would throw a
  //    PasswordException or a cryptic structural error later; checking here
  //    gives a clean 400 without renderer-side cleanup. We also wrap the
  //    page-count introspection here — pdf-lib is lenient and may `load` a
  //    truncated/malformed file but throw on catalog access, which would
  //    otherwise escape both try blocks and leak pdf-lib internals.
  let pageCount;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: false });
    pageCount = pdfDoc.getPageCount();
  } catch (err) {
    const msg = String(err?.message || '');
    if (/encrypt|password/i.test(msg)) {
      const e = new Error('PDF is encrypted or password-protected. Remove the password and retry.');
      e.statusCode = 400;
      throw e;
    }
    const e = new Error('Failed to read PDF. The file may be corrupted.');
    e.statusCode = 400;
    throw e;
  }

  if (pageCount === 0) {
    const e = new Error('PDF has no pages.');
    e.statusCode = 400;
    throw e;
  }
  if (pageCount > MAX_PAGES) {
    const e = new Error(`PDF exceeds the maximum allowed page count of ${MAX_PAGES}. Got ${pageCount} pages.`);
    e.statusCode = 400;
    throw e;
  }

  try {
    // 2. Hand the buffer to pdfjs for rendering. `data` must be a Uint8Array;
    //    pdfjs detaches it, so copy once to keep the caller's buffer intact.
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    const images = [];
    let totalBytes = 0;
    const scale = DPI / 72; // 72 = PDF default DPI (points per inch).

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // PDF page backgrounds are transparent by default; fill white so the
      // resulting JPEG matches what a human sees on paper / in a viewer.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const jpegBuf = canvas.toBuffer('image/jpeg', { quality: 0.85 });
      const base64 = jpegBuf.toString('base64');

      if (!base64) {
        throw new Error(`Failed to render page ${pageNum} of the PDF.`);
      }

      const bytes = Buffer.byteLength(base64, 'base64');
      totalBytes += bytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        const e = new Error(
          `PDF exceeds maximum render budget (${MAX_TOTAL_BYTES} bytes). ` +
            'Reduce the page count, image density, or scan resolution.'
        );
        e.statusCode = 413;
        throw e;
      }
      images.push(base64);
    }

    // Release pdfjs's document hold (closes the worker for this doc).
    pdf.destroy?.();

    return { images, pageCount };
  } catch (error) {
    if (error.statusCode) throw error;
    // Log full detail for ops; client gets a generic message that doesn't
    // reveal the renderer internals (avoids simplifying attacker recon).
    logger.error('[pdf.service] Error converting PDF to images', {
      message: error.message,
      stack: error.stack,
    });
    const e = new Error('Failed to process the uploaded PDF.');
    e.statusCode = 500;
    throw e;
  }
}
