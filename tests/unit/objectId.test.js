import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isValidObjectId } from '../../src/lib/objectId.js';

test('isValidObjectId — accepts valid 24-char hex', () => {
  assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
});

test('isValidObjectId — rejects invalid strings', () => {
  assert.equal(isValidObjectId('not-an-id'), false);
  assert.equal(isValidObjectId(''), false);
  assert.equal(isValidObjectId('507f1f77bcf86cd79943901'), false); // 23 chars
});
