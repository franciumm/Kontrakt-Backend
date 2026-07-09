import { isValidObjectId } from '../lib/objectId.js';
import { AppError } from '../utils/AppError.js';

/**
 * Reject malformed MongoDB ObjectId path params with 400 before Mongoose CastError.
 * @param {string} paramName — req.params key (default: 'id')
 */
export function validateObjectIdParam(paramName = 'id') {
  return (req, _res, next) => {
    const value = req.params[paramName];
    if (!isValidObjectId(value)) {
      return next(new AppError(`Invalid ${paramName}`, 400, 'INVALID_OBJECT_ID'));
    }
    next();
  };
}
