// src/lib/auditValidation.js
// Layer 3 — Output validation for the audit flow.
// Validates raw LLM JSON responses against the expected flag schema,
// enforces length bounds, and checks for system-prompt leakage.

import {
  VALID_CATEGORIES,
  VALID_SEVERITIES,
  MAX_FLAGS,
  MAX_CLAUSE_QUOTE_LEN,
  MAX_PLAIN_ENGLISH_LEN,
} from '../constants/auditCategories.js';

/**
 * Forbidden strings in output — system-prompt leakage indicators.
 * If any of these appear in a flag's text, the response is rejected.
 * @type {RegExp[]}
 */
const LEAKAGE_PATTERNS = [
  /IMMUTABLE CONSTRAINTS/i,
  /Clauseguard Audit/i,
  /OUTPUT SCHEMA/i,
  /You are Clauseguard/i,
];

/**
 * Validate the raw LLM audit response.
 *
 * Checks:
 *  1. JSON parse — reject malformed
 *  2. Top-level shape — must have a flags array
 *  3. Length bounds — flags.length <= MAX_FLAGS
 *  4. Per-flag validation — category, severity, and string length limits
 *  5. System-prompt leakage — reject if leakage patterns found
 *
 * On validation failure → caller should fall back to cache.
 *
 * @param {string} raw — raw string response from the LLM
 * @returns {{ valid: true, flags: Array<{ category: string, severity: string, clause_quote: string, plain_english: string }> } | { valid: false, reason: string }}
 */
export function validateAuditResponse(raw) {
  // 1. JSON parse — reject malformed
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: 'JSON_PARSE_FAILED' };
  }

  // 2. Top-level shape — must have a flags array
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.flags)) {
    return { valid: false, reason: 'SCHEMA_MISMATCH' };
  }

  const { flags } = parsed;

  // 3. Length bounds
  if (flags.length > MAX_FLAGS) {
    return { valid: false, reason: 'TOO_MANY_FLAGS' };
  }

  // 4. Per-flag validation
  const cleanFlags = [];

  for (const f of flags) {
    if (typeof f !== 'object' || f === null) continue;

    const category = String(f.category ?? '');
    const severity = String(f.severity ?? '');
    const clause_quote = String(f.clause_quote ?? '');
    const plain_english = String(f.plain_english ?? '');

    // Validate category and severity against allowed sets
    if (!VALID_CATEGORIES.has(category)) continue;
    if (!VALID_SEVERITIES.has(severity)) continue;

    // Enforce string length limits
    if (clause_quote.length > MAX_CLAUSE_QUOTE_LEN) continue;
    if (plain_english.length > MAX_PLAIN_ENGLISH_LEN) continue;

    // 5. System-prompt leakage check
    const combined = `${category} ${severity} ${clause_quote} ${plain_english}`;
    if (LEAKAGE_PATTERNS.some((p) => p.test(combined))) {
      return { valid: false, reason: 'SYSTEM_PROMPT_LEAKAGE' };
    }

    cleanFlags.push({ category, severity, clause_quote, plain_english });
  }

  return { valid: true, flags: cleanFlags };
}
