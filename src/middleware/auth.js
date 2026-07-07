// Auth + extract-token middleware.
//
// `requireAuth` — verifies the JWT access token from the Authorization header
// (Bearer) or the `accessToken` cookie, and sets `req.user`. Use on any route
// that needs a logged-in identity.
//
// `verifyExtractToken` — enforces the two-step extract→analyze flow (ticket
// SEC-108). Reads `X-Extract-Token` header and binds it to the SHA-256 of
// `req.body.contractText`. Mount AFTER body validation so schema failures
// still surface as 400 (not 403).

import { authService } from '../services/auth.store.js';
import { verifyExtractToken } from '../services/extractToken.js';

function extractBearer(req) {
  const h = req.headers.authorization || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractBearer(req) || req.cookies?.accessToken;
  try {
    req.user = authService.verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function extractTokenGate(req, res, next) {
  const token = req.headers['x-extract-token'] || req.headers['X-Extract-Token'];
  try {
    verifyExtractToken(token, req.body?.contractText);
    next();
  } catch (err) {
    next(err);
  }
}
