import { z } from 'zod';

// Must match MAX_CONTRACT_LENGTH in src/lib/auditSanitize.js — keep in sync.
// We reject bodies larger than the sanitizer would even attempt to handle,
// which is also a cheap DoS brake before any LLM call is made.
export const MAX_CONTRACT_TEXT = 12_000;

export const auditTextSchema = z.object({
  contractText: z
    .string()
    .min(1, 'contractText is required')
    .max(MAX_CONTRACT_TEXT, `contractText must be at most ${MAX_CONTRACT_TEXT} characters`),
});

export const fastScanSchema = auditTextSchema;
