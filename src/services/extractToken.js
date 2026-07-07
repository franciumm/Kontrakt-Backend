// Extract→analyze binding token (ticket SEC-108).
//
// Threat: without this, /analyze accepts any `contractText`. A user could
// extract contract A (clean), then submit a different, manipulated text to
// /analyze and "prove" an unrelated contract is clean.
//
// Defense: /extract mints a short-lived JWT whose payload binds the SHA-256 of
// the extracted text. /analyze verifies the token AND recomputes the hash of
// the submitted text; a mismatch (or missing/expired/tampered token) yields
// 403. The token carries no user identity — see auth.service for that.
//
// UX note: this strictly binds the exact extracted bytes. If the user edits
// the text between steps (the two-step review window), they must re-extract.
// That's the secure choice; relaxed edit-distance is a follow-up.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';

/**
 * SHA-256 hex hash of the input text. Used as the binding value in the token.
 */
export function hashContractText(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * Mint a token binding the supplied text. Called by /extract.
 * @param {string} text
 * @returns {string} signed JWT
 */
export function signExtractToken(text) {
  const textHash = hashContractText(text);
  return jwt.sign(
    { purpose: 'extract', textHash },
    config.auth.extractTokenSecret,
    { expiresIn: config.auth.extractTokenExpiresIn }
  );
}

/**
 * Verify a token against the supplied text. Throws AppError(403) on any
 * mismatch. Returns void on success.
 *
 * @param {string} token
 * @param {string} text
 * @param {{ clockToleranceSec?: number }} [_opts]
 */
export function verifyExtractToken(token, text) {
  if (!token) {
    throw new AppError('Missing extract token. Run /extract first.', 403, 'EXTRACT_TOKEN_MISSING');
  }
  let payload;
  try {
    payload = jwt.verify(token, config.auth.extractTokenSecret);
  } catch (err) {
    const message = /expired/i.test(err?.message || '')
      ? 'Extract token expired. Re-run /extract.'
      : 'Invalid extract token.';
    throw new AppError(message, 403, 'EXTRACT_TOKEN_INVALID');
  }
  if (payload?.purpose !== 'extract') {
    throw new AppError('Invalid extract token.', 403, 'EXTRACT_TOKEN_INVALID');
  }
  const expected = hashContractText(text);
  if (!crypto.timingSafeEqual(
    Buffer.from(String(payload.textHash)),
    Buffer.from(expected)
  )) {
    throw new AppError(
      'Extract token does not match the submitted text. Re-run /extract with the exact extracted text.',
      403,
      'EXTRACT_TOKEN_MISMATCH'
    );
  }
}
