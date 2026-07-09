

import { authService } from '../services/auth.store.js';
import { verifyExtractToken } from '../services/extractToken.js';

function extractBearer(req) {
  const h = req.headers.authorization || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractBearer(req) || req.cookies?.Kontrakt_access_token;
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
