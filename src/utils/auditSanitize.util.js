/**
 * Layer 1 Defense - Input Sanitization
 * This utility strips known attack patterns from the pasted contract before it hits the prompt.
 */

const MAX_CONTRACT_LENGTH = 12000; // tokens-ish; truncate before sending

const INJECTION_PATTERNS = [
  // Classic instruction override
  { pattern: /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/gi, label: "INSTRUCTION_OVERRIDE" },
  // Role-switch attempts
  { pattern: /you are now (a |an )?(helpful |developer |admin )?(assistant|ai|bot|agent)/gi, label: "ROLE_SWITCH" },
  // System prompt extraction
  { pattern: /(reveal|show|repeat|print) (your |the )?(system )?prompt/gi, label: "PROMPT_EXTRACTION" },
  // New-instruction markers
  { pattern: /new (instructions|prompt|rules?):/gi, label: "NEW_INSTRUCTIONS" },
  // System-prompt references
  { pattern: /<\/?(system_?prompt|instructions?|rules?)>/gi, label: "TAG_INJECTION" },
  // Llama-style instruction markers
  { pattern: /\[\/?INST\]/gi, label: "LLAMA_MARKER" },
  // Base64-encoded payloads (long base64 strings decode to "ignore" patterns)
  { pattern: /[A-Za-z0-9+/]{60,}={0,2}/g, label: "BASE64_PAYLOAD" },
  // HTML tags (could carry hidden text / event handlers)
  { pattern: /<\/?\w+[^>]*>/g, label: "HTML_TAG" },
];

export function sanitizeContractText(raw) {
  let text = raw || '';
  const flaggedPatterns = [];
  let truncated = false;

  // Length cap first — protects context window + token cost
  if (text.length > MAX_CONTRACT_LENGTH) {
    text = text.substring(0, MAX_CONTRACT_LENGTH);
    truncated = true;
  }

  // Strip zero-width characters (common indirect-injection vector)
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Apply each injection pattern
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      flaggedPatterns.push(label);
      text = text.replace(pattern, "[FILTERED]");
    }
  }

  return { sanitized: text, flaggedPatterns, truncated };
}
