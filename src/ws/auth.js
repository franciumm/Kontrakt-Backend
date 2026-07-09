// src/ws/auth.js
// JWT authentication for WebSocket connections.
// Verifies the token from the `?token=` query parameter on upgrade.

import { URL } from 'node:url';
import { authService } from '../services/auth.store.js';

/**
 * Authenticate a WebSocket connection using a raw token.
 *
 * Verifies it using the same authService that protects HTTP routes.
 *
 * @param {string} token
 * @returns {{ user: { _id: string, email: string } }}
 * @throws {Error} with `code` property for the WS close code
 */
export function authenticateWsToken(token) {
  if (!token) {
    const err = new Error('Missing authentication token');
    err.code = 4401;
    throw err;
  }

  try {
    const user = authService.verifyAccessToken(token);
    return { user };
  } catch {
    const err = new Error('Invalid or expired authentication token');
    err.code = 4401;
    throw err;
  }
}
