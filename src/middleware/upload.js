import multer from 'multer';

// 2 MB cap. The previous 5 MB was permissive enough to allow PDF
// decompression bombs to reach ghostscript before our MAX_TOTAL_BYTES
// brake could trip — a 1 MB crafted PDF can decompress to GBs in RAM.
// 2 MB is still comfortable for a 10-page text contract.
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Store strictly in memory so we don't leave artifacts on the disk,
// which is crucial for serverless deployments.
const storage = multer.memoryStorage();

// Validate file type. Exported for direct unit testing.
export function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    // Attach statusCode so errorHandler renders a 400 — multer does NOT
    // wrap fileFilter errors as MulterError (only its internal limits are).
    const err = new Error('Invalid file type. Only PDF files are allowed.');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
}

export const pdfUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});
