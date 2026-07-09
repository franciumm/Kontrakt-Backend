// src/constants/jobStatus.js
// Job status constants for all WebSocket operations.

/** Operation identifiers — used in WS messages as `operation` field. */
export const OPERATIONS = Object.freeze({
  AUDIT_EXTRACT: 'audit:extract',
  AUDIT_ANALYZE: 'audit:analyze',
  AUDIT_FAST_SCAN: 'audit:fast-scan',
  CONTRACT_START: 'contract:start',
  CONTRACT_ANSWER: 'contract:answer',
  CONTRACT_GENERATE: 'contract:generate',
  CONTRACT_REPORT: 'contract:report',
});

/**
 * Status steps per operation. Each operation has a defined sequence of
 * intermediate statuses before reaching 'complete' or 'failed'.
 */
export const STATUS_STEPS = Object.freeze({
  [OPERATIONS.AUDIT_EXTRACT]: ['converting-pages', 'transcribing', 'complete'],
  [OPERATIONS.AUDIT_ANALYZE]: ['sanitizing', 'running-classifier', 'deep-audit', 'validating-output', 'complete'],
  [OPERATIONS.AUDIT_FAST_SCAN]: ['scanning', 'complete'],
  [OPERATIONS.CONTRACT_START]: ['parsing-gig', 'complete'],
  [OPERATIONS.CONTRACT_ANSWER]: ['computing-exposure', 'complete'],
  [OPERATIONS.CONTRACT_GENERATE]: ['assembling-contract', 'streaming', 'complete'],
  [OPERATIONS.CONTRACT_REPORT]: ['generating-report', 'complete'],
});

/** Terminal job states. */
export const JOB_STATE = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed',
});
