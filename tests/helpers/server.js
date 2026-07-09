// Spin up the real Express app on an ephemeral port for integration tests.
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { attachWebSocketServer } from '../../src/ws/server.js';
import { connectTestDb, disconnectTestDb } from './db.js';

/**
 * @param {{ withWs?: boolean, withDb?: boolean }} opts
 */
export async function startServer(opts = {}) {
  const { withWs = false, withDb = false } = opts;

  if (withDb) await connectTestDb();

  const app = createApp();
  const server = http.createServer(app);

  if (withWs) {
    attachWebSocketServer(server);
  }

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = withWs ? `ws://127.0.0.1:${port}/ws` : null;

  const close = async () => {
    await new Promise((r) => server.close(r));
    if (withDb) await disconnectTestDb();
  };

  return { baseUrl, wsUrl, close, port };
}

export function buildMultipartFile(fieldName, filename, fileBuffer, mimetype = 'application/pdf') {
  const boundary = '----kontrakt-test-' + Math.random().toString(16).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`));
  parts.push(Buffer.from(`Content-Type: ${mimetype}\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

export function generateTestToken(userId = '000000000000000000000000', email = 'test@example.com') {
  return jwt.sign({ id: userId, email }, config.auth.jwtAccessSecret, { expiresIn: '1h' });
}

/**
 * Wait for a specific WebSocket message type.
 * @param {import('ws').WebSocket} ws
 * @param {string} type
 * @param {number} timeoutMs
 */
export function waitForWsMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for WS message type: ${type}`));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === type) {
          cleanup();
          resolve(msg);
        }
      } catch {
        // Ignore non-JSON frames.
      }
    }

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
    }

    ws.on('message', onMessage);
  });
}
