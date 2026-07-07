import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VALID_CATEGORIES, VALID_SEVERITIES, MAX_FLAGS, MAX_CLAUSE_QUOTE_LEN, MAX_PLAIN_ENGLISH_LEN } from '../../src/constants/auditCategories.js';
import { AUDIT_SYSTEM_PROMPT } from '../../src/lib/auditPrompt.js';
import { __SCHEMAS } from '../../src/services/audit.service.js';

const { DEEP_AUDIT_SCHEMA } = __SCHEMAS;

// Per CLAUDE.md: when changing enum values, all four locations must agree.
// This test keeps that contract honest without manual bookkeeping.
test('constants ↔ system prompt ↔ JSON schema — all 10 categories agree', () => {
  const expected = [...VALID_CATEGORIES].sort();

  for (const c of expected) {
    assert.ok(AUDIT_SYSTEM_PROMPT.includes(c), `system prompt missing category: ${c}`);
  }

  const schemaEnum = DEEP_AUDIT_SCHEMA.$defs.AuditResponse.properties.flags.items.properties.category.enum;
  assert.deepEqual([...schemaEnum].sort(), expected);
});

test('constants ↔ JSON schema — severities agree', () => {
  const expected = [...VALID_SEVERITIES].sort();
  const schemaEnum = DEEP_AUDIT_SCHEMA.$defs.AuditResponse.properties.flags.items.properties.severity.enum;
  assert.deepEqual([...schemaEnum].sort(), expected);
});

test('constants — sane bounds', () => {
  assert.equal(MAX_FLAGS, 20);
  assert.equal(MAX_CLAUSE_QUOTE_LEN, 200);
  assert.equal(MAX_PLAIN_ENGLISH_LEN, 280);
  assert.equal(VALID_CATEGORIES.size, 10);
  assert.equal(VALID_SEVERITIES.size, 3);
});
