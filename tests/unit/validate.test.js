import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateAuditResponse } from '../../src/lib/auditValidation.js';

test('validateAuditResponse — accepts a well-formed response', () => {
  const raw = JSON.stringify({
    flags: [
      {
        category: 'work-for-hire-trap',
        severity: 'red',
        clause_quote: 'Client owns all deliverables on signature.',
        plain_english: 'You lose IP rights before payment.',
      },
    ],
  });
  const result = validateAuditResponse(raw);
  assert.equal(result.valid, true);
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].category, 'work-for-hire-trap');
});

test('validateAuditResponse — rejects malformed JSON', () => {
  const result = validateAuditResponse('{ not json');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'JSON_PARSE_FAILED');
});

test('validateAuditResponse — rejects when flags is not an array', () => {
  const result = validateAuditResponse(JSON.stringify({ flags: 'oops' }));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'SCHEMA_MISMATCH');
});

test('validateAuditResponse — rejects unknown category', () => {
  const raw = JSON.stringify({
    flags: [{ category: 'made-up-category', severity: 'red', clause_quote: 'x', plain_english: 'y' }],
  });
  const result = validateAuditResponse(raw);
  assert.equal(result.valid, true); // valid response, but the bad flag is dropped
  assert.equal(result.flags.length, 0);
});

test('validateAuditResponse — rejects unknown severity by dropping the flag', () => {
  const raw = JSON.stringify({
    flags: [{ category: 'work-for-hire-trap', severity: 'purple', clause_quote: 'x', plain_english: 'y' }],
  });
  const result = validateAuditResponse(raw);
  assert.equal(result.valid, true);
  assert.equal(result.flags.length, 0);
});

test('validateAuditResponse — rejects non-string raw input via graceful catch', () => {
  // The lib's contract is "raw is a string from the LLM API". Non-string
  // inputs are coerced to string by JSON.parse and rejected as malformed.
  // The catch block returns JSON_PARSE_FAILED rather than throwing.
  const result = validateAuditResponse({ flags: [] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'JSON_PARSE_FAILED');
});

test('validateAuditResponse — detects system-prompt leakage in any flag field', () => {
  const leakageStrings = [
    'IMMUTABLE CONSTRAINTS are listed here',
    'You are Clauseguard Audit',
    'OUTPUT SCHEMA is below',
    'RED-FLAG TAXONOMY reference',
    'sandwich defense applied',
  ];
  for (const leak of leakageStrings) {
    const raw = JSON.stringify({
      flags: [
        {
          category: 'work-for-hire-trap',
          severity: 'red',
          clause_quote: leak,
          plain_english: 'some explanation',
        },
      ],
    });
    const result = validateAuditResponse(raw);
    assert.equal(result.valid, false, `expected leakage detection for: ${leak}`);
    assert.equal(result.reason, 'SYSTEM_PROMPT_LEAKAGE');
  }
});

test('validateAuditResponse — caps at MAX_FLAGS = 20', () => {
  const flag = { category: 'work-for-hire-trap', severity: 'red', clause_quote: 'q', plain_english: 'p' };
  const raw = JSON.stringify({ flags: Array(25).fill(flag) });
  const result = validateAuditResponse(raw);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'TOO_MANY_FLAGS');
});

test('validateAuditResponse — accepts every valid category in groups under MAX_FLAGS', () => {
  const categories = [
    'work-for-hire-trap', 'unlimited-revisions', 'missing-kill-fee', 'vague-scope',
    'ip-transfer-timing', 'asymmetric-indemnification', 'no-late-payment-penalty',
    'overbroad-nda', 'auto-renewal', 'jurisdiction-mismatch',
  ];
  const severities = ['red', 'yellow', 'green'];
  // All 10 categories in one response (10 flags < MAX_FLAGS=20).
  const allCats = categories.map((c) => ({
    category: c, severity: severities[0], clause_quote: 'q', plain_english: 'p',
  }));
  assert.equal(validateAuditResponse(JSON.stringify({ flags: allCats })).valid, true);

  // All 3 severities for one category (3 flags).
  const allSev = severities.map((s) => ({
    category: categories[0], severity: s, clause_quote: 'q', plain_english: 'p',
  }));
  assert.equal(validateAuditResponse(JSON.stringify({ flags: allSev })).flags.length, 3);
});

test('validateAuditResponse — null raw returns SCHEMA_MISMATCH, not crash', () => {
  // JSON.parse('null') === null — lib must guard against this.
  const result = validateAuditResponse('null');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'SCHEMA_MISMATCH');
});
