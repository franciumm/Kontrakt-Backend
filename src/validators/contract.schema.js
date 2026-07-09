// src/validators/contract.schema.js
// Zod validation schemas for contract interrogator endpoints.

import { z } from 'zod';
import { isValidObjectId } from '../lib/objectId.js';

const objectIdSchema = z
  .string()
  .min(1)
  .refine(isValidObjectId, { message: 'Invalid contractId format' });

/** POST /api/contract/start — begin a new contract session. */
export const startContractSchema = z.object({
  gigDescription: z
    .string()
    .min(1, 'gigDescription is required')
    .max(5000, 'gigDescription must be at most 5000 characters'),
});

/** POST /api/contract/answer — submit answers to questions. */
export const answerContractSchema = z.object({
  contractId: objectIdSchema,
  answers: z.record(z.string(), z.string()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'At least one answer is required' }
  ),
});

/** POST /api/contract/generate — generate the final contract text. */
export const generateContractSchema = z.object({
  contractId: objectIdSchema,
});

/** POST /api/contract/report — generate the exposure report. */
export const reportContractSchema = z.object({
  contractId: objectIdSchema,
});
