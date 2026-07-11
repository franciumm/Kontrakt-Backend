import { z } from 'zod';

// Must match MAX_CONTRACT_LENGTH in src/lib/auditSanitize.js — keep in sync.
// We reject bodies larger than the sanitizer would even attempt to handle,
// which is also a cheap DoS brake before any LLM call is made.
const MAX_CONTRACT_TEXT = 250_000;

export const auditTextSchema = z.object({
  contractText: z
    .string()
    .min(1, 'contractText is required')
    .max(MAX_CONTRACT_TEXT, `contractText must be at most ${MAX_CONTRACT_TEXT} characters`),
});

const MAX_PAGES = 20;
const MAX_BASE64_LENGTH = 10_000_000; // 10MB per image maximum

export const extractBase64Schema = z.object({
  images: z
    .array(
      z.string()
        .min(1, 'Image string cannot be empty')
        .max(MAX_BASE64_LENGTH, 'Image base64 string is too large')
        .regex(/^data:image\/(jpeg|png);base64,/, 'Image must be a valid base64 data URI (jpeg or png)')
    )
    .min(1, 'At least one image is required')
    .max(MAX_PAGES, `Cannot extract more than ${MAX_PAGES} pages at a time`)
});

