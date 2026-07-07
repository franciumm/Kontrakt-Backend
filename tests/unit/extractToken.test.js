// Extract-token unit tests (ticket SEC-108). Pure crypto + JWT — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { signExtractToken, verifyExtractToken, hashContractText } from '../../src/services/extractToken.js';
import { AppError } from '../../src/utils/AppError.js';

const TEXT = 'Designer agrees to deliver one logo for $2,000, net 30.';

test('signExtractToken — returns a compact JWT string with the text-hash payload', () => {
  const token = signExtractToken(TEXT);
  assert.equal(typeof token, 'string');
  assert.equal(token.split('.').length, 3, 'JWT must have 3 dot-delimited segments');
});

test('verifyExtractToken — succeeds (no throw) when token matches the exact text', () => {
  const token = signExtractToken(TEXT);
  assert.doesNotThrow(() => verifyExtractToken(token, TEXT));
});

test('verifyExtractToken — throws 403 EXTRACT_TOKEN_MISSING when no token supplied', () => {
  assert.throws(
    () => verifyExtractToken(undefined, TEXT),
    (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'EXTRACT_TOKEN_MISSING'
  );
});

test('verifyExtractToken — throws 403 MISMATCH when the submitted text differs from the extracted text', () => {
  // The exact threat from SEC-108: extract clean text A, then try to "prove"
  // a different contract B is clean using A's token. Must be rejected.
  const token = signExtractToken(TEXT);
  const tampered = TEXT.replace('$2,000', '$5');
  assert.throws(
    () => verifyExtractToken(token, tampered),
    (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'EXTRACT_TOKEN_MISMATCH'
  );
});

test('verifyExtractToken — throws 403 INVALID on a tampered/garbage token', () => {
  assert.throws(
    () => verifyExtractToken('not.a.real-token', TEXT),
    (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'EXTRACT_TOKEN_INVALID'
  );
});

test('verifyExtractToken — throws 403 INVALID on a foreign JWT signed with a different secret', async () => {
  // A token minted for a different purpose (e.g. an access token) must not pass.
  const jwt = (await import('jsonwebtoken')).default;
  const foreign = jwt.sign({ purpose: 'access', textHash: hashContractText(TEXT) }, 'a-different-secret');
  assert.throws(
    () => verifyExtractToken(foreign, TEXT),
    (err) => err instanceof AppError && err.statusCode === 403
  );
});

test('verifyExtractToken — rejects a token whose purpose is not "extract"', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  // Signed with the correct secret but wrong purpose claim — defense in depth.
  const wrongPurpose = jwt.sign(
    { purpose: 'other', textHash: hashContractText(TEXT) },
    process.env.JWT_EXTRACT_SECRET || 'dev-extract-secret-change-me'
  );
  assert.throws(
    () => verifyExtractToken(wrongPurpose, TEXT),
    (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'EXTRACT_TOKEN_INVALID'
  );
});

test('verifyExtractToken — single-byte edits to the text invalidate the token', () => {
  const token = signExtractToken(TEXT);
  for (const mutation of [
    TEXT + ' ', // trailing space
    ' ' + TEXT, // leading space
    TEXT.replace('net 30', 'net 31'), // single-char change
    TEXT.toLowerCase(),
    TEXT.slice(0, -1), // truncate last char
  ]) {
    assert.throws(
      () => verifyExtractToken(token, mutation),
      (err) => err.code === 'EXTRACT_TOKEN_MISMATCH',
      `mutation should mismatch: "${mutation.slice(0, 40)}..."`
    );
  }
});

test('hashContractText — deterministic, 64-char hex, sensitive to edits', () => {
  const a = hashContractText(TEXT);
  const b = hashContractText(TEXT);
  assert.equal(a, b, 'same input → same hash');
  assert.equal(a.length, 64, 'sha256 hex');
  assert.equal(/^[0-9a-f]{64}$/.test(a), true);
  assert.notEqual(a, hashContractText(TEXT + ' '));
});
