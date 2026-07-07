// src/lib/auditSanitize.js
// Layer 1 — Input sanitization for the audit flow.
// Light regex pass on pasted contract text BEFORE prompt assembly.
// Catches obvious prompt-injection patterns. NOT sufficient alone —
// that's why Layers 2 (prompt architecture) and 3 (output validation) exist.

const MAX_CONTRACT_LENGTH = 12_000;

/**
 * Known prompt-injection patterns.
 * Each entry has a regex pattern and a human-readable label for logging.
 * @type {Array<{ pattern: RegExp, label: string }>}
 */
const INJECTION_PATTERNS = [
  // Classic instruction override
  {
    pattern: /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/gi,
    label: 'INSTRUCTION_OVERRIDE',
  },
  // Role-switch attempts
  {
    pattern: /you are now (a |an )?(helpful |developer |admin )?(assistant|ai|bot|agent)/gi,
    label: 'ROLE_SWITCH',
  },
  // System prompt extraction
  {
    pattern: /(reveal|show|repeat|print) (your |the )?(system )?prompt/gi,
    label: 'PROMPT_EXTRACTION',
  },
  // New-instruction markers
  {
    pattern: /new (instructions|prompt|rules?):/gi,
    label: 'NEW_INSTRUCTIONS',
  },
  // System-prompt tag references
  {
    pattern: /<\/?(system_?prompt|instructions?|rules?)>/gi,
    label: 'TAG_INJECTION',
  },
  // Llama-style instruction markers
  {
    pattern: /\[\/?INST\]/gi,
    label: 'LLAMA_MARKER',
  },
  // Base64-encoded payloads (long base64 strings may decode to injection payloads)
  {
    pattern: /[A-Za-z0-9+/]{60,}={0,2}/g,
    label: 'BASE64_PAYLOAD',
  },
  // HTML tags (could carry hidden text / event handlers)
  {
    pattern: /<\/?\w+[^>]*>/g,
    label: 'HTML_TAG',
  },
];

/**
 * Sanitize raw contract text for safe LLM consumption.
 *
 * Steps:
 *  1. Truncate if exceeding MAX_CONTRACT_LENGTH
 *  2. Strip zero-width unicode characters (common indirect-injection vector)
 *  3. Test and replace each injection pattern with '[FILTERED]'
 *
 * @param {string} raw — the raw pasted contract text
 * @returns {{ sanitized: string, flaggedPatterns: string[], truncated: boolean }}
 */
export function sanitizeContractText(raw) {
  let text = raw;
  const flaggedPatterns = [];
  let truncated = false;

  // 1. Length cap — protects context window + token cost
  if (text.length > MAX_CONTRACT_LENGTH) {
    text = text.substring(0, MAX_CONTRACT_LENGTH);
    truncated = true;
  }

  // 2. Strip zero-width characters
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. Apply each injection pattern
  for (const { pattern, label } of INJECTION_PATTERNS) {
    // Reset regex lastIndex for global patterns before testing
    pattern.lastIndex = 0;

    if (pattern.test(text)) {
      flaggedPatterns.push(label);

      // Reset lastIndex again — .test() advances it for global regexes
      pattern.lastIndex = 0;
      text = text.replace(pattern, '[FILTERED]');
    }
  }

  return { sanitized: text, flaggedPatterns, truncated };
}
