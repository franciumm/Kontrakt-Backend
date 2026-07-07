import { logger } from '../utils/logger.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { config } from '../config/index.js';

export const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  if (err.name === 'ZodError') {
    const validationErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn('Validation error', { errors: validationErrors });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: validationErrors,
      },
    });
  }

  logger.error(err.message, {
    statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  const response = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      ...(config.nodeEnv !== 'production' && { stack: err.stack }),
    },
  };

  return res.status(statusCode).json(response);
};
