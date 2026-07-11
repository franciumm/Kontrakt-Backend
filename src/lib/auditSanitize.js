// src/lib/auditSanitize.js
// Layer 1 — Input sanitization for the audit flow.
// Light regex pass on pasted contract text BEFORE prompt assembly.
// Catches obvious prompt-injection patterns. NOT sufficient alone —
// that's why Layers 2 (prompt architecture) and 3 (output validation) exist.

const MAX_CONTRACT_LENGTH = 100_000;

/**
 * Known prompt-injection patterns.
 * Each entry has a regex pattern and a human-readable label for logging.
 * @type {Array<{ pattern: RegExp, label: string }>}
 */
const INJECTION_PATTERNS = [
  // Classic instruction override (English)
  {
    pattern: /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/gi,
    label: 'INSTRUCTION_OVERRIDE',
  },
  // Multilingual instruction-override coverage (ticket SEC-101). The English
  // regex above is the canonical pattern; these mirror it in the languages
  // most likely to appear in contracts crossing locale boundaries.
  // German
  {
    pattern: /ignoriere (alle )?(vorherigen|bisherigen|früheren)? ?(anweisungen|regeln|befehle)/i,
    label: 'INSTRUCTION_OVERRIDE_DE',
  },
  { pattern: /vergiss (alle )?(vorherigen|bisherigen)? ?(anweisungen|regeln)/i, label: 'INSTRUCTION_OVERRIDE_DE' },
  // French
  {
    pattern: /ignore (toutes? )?(les )?(instructions|consignes|règles|indications) (précédentes|antérieures|ci-dessus)/i,
    label: 'INSTRUCTION_OVERRIDE_FR',
  },
  { pattern: /oublie (toutes? )?les (instructions|consignes|règles) (précédentes|antérieures)/i, label: 'INSTRUCTION_OVERRIDE_FR' },
  // Spanish
  {
    pattern: /ignora (todas? )?las?(instrucciones|reglas|indicaciones) (anteriores|previas)/i,
    label: 'INSTRUCTION_OVERRIDE_ES',
  },
  { pattern: /olvida (todas? )?las?(instrucciones|reglas) (anteriores|previas)/i, label: 'INSTRUCTION_OVERRIDE_ES' },
  // Portuguese
  {
    pattern: /ignore (todas? )?as?(instruções|regras|indicações) (anteriores|prévias)/i,
    label: 'INSTRUCTION_OVERRIDE_PT',
  },
  // Italian
  {
    pattern: /ignora (tutte )?le?(istruzioni|regole) (precedenti|sopra)/i,
    label: 'INSTRUCTION_OVERRIDE_IT',
  },
  // Chinese (Simplified + Traditional) — "忽略之前的指令" / "忘記先前的指示"
  { pattern: /忽略(所有|全部)?(之前|先前|前面|上述)的?(指令|指示|说明|规则|規則)/u, label: 'INSTRUCTION_OVERRIDE_ZH' },
  { pattern: /忘記(所有|全部)?(之前|先前|前面)的?(指令|指示|说明)/u, label: 'INSTRUCTION_OVERRIDE_ZH' },
  // Japanese — "前の指示を無視して"
  { pattern: /(前|以前)の(指示|命令|ルール)を?(無視|忘れ)/u, label: 'INSTRUCTION_OVERRIDE_JA' },
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
  let text = typeof raw === 'string' ? raw : '';
  const flaggedPatterns = [];
  let truncated = false;

  // 1. Length cap — protects context window + token cost
  if (text.length > MAX_CONTRACT_LENGTH) {
    text = text.substring(0, MAX_CONTRACT_LENGTH);
    truncated = true;
  }

  // 2. Strip zero-width / invisible characters. Beyond the classic
  // BOM/zero-width family, this also catches the soft hyphen, word joiner,
  // mongolian vowel separator, and bidi overrides — all known
  // indirect-injection vectors that defeat regex pattern matching.
  text = text.replace(
    /[\u200B-\u200D\uFEFF\u00AD\u2060\u180E\u202A-\u202E\u2066-\u2069]/g,
    ''
  );

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
