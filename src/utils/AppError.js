/**
 * Lightweight HTTP error with a status code. Throws of `AppError` are handled
 * by src/middleware/errorHandler.js, which reads `err.statusCode`.
 *
 * Usage:  throw new AppError('Email already exists', 409);
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (code) this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
