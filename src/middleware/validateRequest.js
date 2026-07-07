// Body-validation middleware factory backed by Zod. Throws a structured
// error that errorHandler.js renders as a 400 with field-level details.
//
// Usage:
//   router.post('/analyze', validateRequest(auditTextSchema), analyzeContract);
import { z } from 'zod';

export function validateRequest(schema, { source = 'body' } = {}) {
  return (req, _res, next) => {
    const target = req[source];
    const result = schema.safeParse(target);
    if (!result.success) {
      const err = new Error('Validation failed');
      err.name = 'ZodError';
      err.statusCode = 400;
      err.errors = result.error.errors;
      return next(err);
    }
    req[source] = result.data;
    next();
  };
}
