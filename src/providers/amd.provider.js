import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

function makeClient({ baseURLEnv, apiKeyEnv, defaultPort, label }) {
  const baseURL = process.env[baseURLEnv];
  if (!baseURL) {
    console.warn(`WARNING: ${baseURLEnv} is not set — ${label} will be unavailable.`);
  }
  return new OpenAI({
    baseURL: baseURL || `http://localhost:${defaultPort}/v1`,
    apiKey: process.env[apiKeyEnv] || 'amd-no-key-needed',
    defaultHeaders: { 'Bypass-Tunnel-Reminder': 'true' },
    maxRetries: 2,
    timeout: 30 * 60 * 1000, // 30 min — 90B vision OCR can be slow
  });
}

// Default export = vision client. Used by src/services/vision.service.js.
const vision = makeClient({
  baseURLEnv: 'AMD_BASE_URL',
  apiKeyEnv: 'AMD_API_KEY',
  defaultPort: 8000,
  label: 'vision OCR (/api/audit/extract)',
});

// Named export = classifier client. Used by Layer 5 in audit.service.js.
const classifier = makeClient({
  baseURLEnv: 'AMD_CLASSIFIER_BASE_URL',
  apiKeyEnv: 'AMD_CLASSIFIER_API_KEY',
  defaultPort: 8001,
  label: 'injection classifier (Layer 5)',
});

export { classifier };
export default vision;
