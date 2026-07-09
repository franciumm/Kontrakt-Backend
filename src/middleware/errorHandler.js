import { logger } from '../utils/logger.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { config } from '../config/index.js';

// Map well-known framework/lib errors to the right status code so clients get
// a meaningful 4xx instead of an opaque 500.
function classifyError(err) {
  if (err.name === 'ZodError') {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      body: {
        success: false,
        error: {
          message: 'Validation failed',
          details: (err.errors || []).map((e) => ({
            field: (e.path || []).join('.'),
            message: e.message,
          })),
        },
      },
    };
  }

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      body: {
        success: false,
        error: { message: 'Invalid ID format', code: 'INVALID_OBJECT_ID' },
      },
    };
  }

  // Multer errors (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, etc.)
  if (err.name === 'MulterError' || err?.code?.startsWith?.('LIMIT_')) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Maximum size is 2 MB.'
        : err.message || 'Upload error.';
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      body: {
        success: false,
        error: { message, code: err.code || 'MULTER_ERROR' },
      },
    };
  }

  // Anything explicitly thrown with a statusCode (our convention) — includes
  // AppError instances and our middleware-produced errors. Surface `code`
  // when present so clients can branch on stable machine codes (auth/extract
  // tokens, rate-limit, concurrency, etc.).
  if (err.statusCode) {
    const errorBody = { message: err.message };
    if (err.code) errorBody.code = err.code;
    return { statusCode: err.statusCode, body: { success: false, error: errorBody } };
  }

  return {
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: { success: false, error: { message: err.message || 'Internal server error' } },
  };
}

export const errorHandler = (err, req, res, _next) => {
  const { statusCode, body } = classifyError(err);

  if (statusCode >= 500) {
    logger.error(err.message, {
      statusCode,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn(err.message, { statusCode, url: req.originalUrl });
  }

  // Stack traces are dev-only — never leak in production.
  if (config.nodeEnv !== 'production' && statusCode >= 500 && err.stack) {
    body.error.stack = err.stack;
  }

  return res.status(statusCode).json(body);
};
