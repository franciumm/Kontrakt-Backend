import { z } from 'zod';

/**
 * Layer 3 Defense - Output Validation
 * Validates the JSON schema of the audit response, ensures bounds, and checks for prompt leakage.
 */

const VALID_CATEGORIES = [
  "work-for-hire-trap", "unlimited-revisions", "missing-kill-fee",
  "vague-scope", "ip-transfer-timing", "asymmetric-indemnification",
  "no-late-payment-penalty", "overbroad-nda", "auto-renewal", "jurisdiction-mismatch",
];

const VALID_SEVERITIES = ["red", "yellow", "green"];
const MAX_FLAGS = 20;

// Forbidden strings in output (system-prompt leakage indicators)
const LEAKAGE_PATTERNS = [
  /IMMUTABLE CONSTRAINTS/i,
  /Clauseguard Audit/i,
  /OUTPUT SCHEMA/i,
  /You are Clauseguard/i,
];

const auditFlagSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  severity: z.enum(VALID_SEVERITIES),
  clause_quote: z.string().max(200),
  plain_english: z.string().max(280),
});

const auditResponseSchema = z.object({
  flags: z.array(auditFlagSchema).max(MAX_FLAGS),
});

export function validateAuditResponse(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return { valid: false, reason: "JSON_PARSE_FAILED" };
  }

  const result = auditResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { valid: false, reason: "SCHEMA_MISMATCH", details: result.error.errors };
  }

  const flags = result.data.flags;
  const cleanFlags = [];

  for (const flag of flags) {
    const { category, severity, clause_quote, plain_english } = flag;
    const combined = `${category} ${severity} ${clause_quote} ${plain_english}`;
    
    // System-prompt leakage check
    if (LEAKAGE_PATTERNS.some(p => p.test(combined))) {
      return { valid: false, reason: "SYSTEM_PROMPT_LEAKAGE" };
    }
    
    cleanFlags.push(flag);
  }

  return { valid: true, flags: cleanFlags };
}
