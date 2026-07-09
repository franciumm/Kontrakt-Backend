// src/ws/server.js
// WebSocket server using `ws`. Attaches to the existing HTTP server,
// authenticates connections via JWT, and routes subscribe messages
// to the job manager.

import { WebSocketServer } from 'ws';
import { authenticateWsToken } from './auth.js';
import { jobManager } from './jobManager.js';
import { STATUS_STEPS } from '../constants/jobStatus.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Path: /ws
 *
 * @param {import('http').Server} httpServer
 * @returns {WebSocketServer}
 */
export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  // Heartbeat — detect dead connections.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        jobManager.unsubscribe(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws, req) => {
    // Parse cookies from the handshake request to support HttpOnly auth.
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/(?:(?:^|.*;\s*)Kontrakt_access_token\s*\=\s*([^;]*).*$)|^.*$/);
    const cookieToken = tokenMatch ? tokenMatch[1] : null;

    if (cookieToken) {
      try {
        const auth = authenticateWsToken(cookieToken);
        ws.userId = auth.user._id;
        ws.send(JSON.stringify({
          type: 'connected',
          userId: auth.user._id,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        // If cookie token is invalid, we don't drop immediately; they might send an auth message.
      }
    }

    // Auth timeout: disconnect if no userId is set within 5s.
    const authTimeout = setTimeout(() => {
      if (!ws.userId) ws.close(4401, 'Authentication timeout');
    }, 5000);

    if (ws.userId) clearTimeout(authTimeout);

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'auth') {
        try {
          const auth = authenticateWsToken(msg.token);
          ws.userId = auth.user._id;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({
            type: 'connected',
            userId: auth.user._id,
            timestamp: new Date().toISOString(),
          }));
        } catch (err) {
          ws.close(err.code || 4401, err.message);
        }
        return;
      }

      if (!ws.userId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return;
      }

      if (msg.type === 'subscribe' && msg.jobId) {
        handleSubscribe(ws, msg.jobId).catch(() => {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to subscribe', jobId: msg.jobId }));
        });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      jobManager.unsubscribe(ws);
    });
  });

  // eslint-disable-next-line no-console
  console.log('[ws] WebSocket server attached on /ws');
  return wss;
}

/**
 * Handle a subscribe message — validate job ownership and add subscriber.
 */
async function handleSubscribe(ws, jobId) {
  const job = await jobManager.getJob(jobId);

  if (!job) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Job not found',
      jobId,
    }));
    return;
  }

  // Verify ownership — users can only subscribe to their own jobs.
  if (job.userId !== ws.userId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Unauthorized: job belongs to a different user',
      jobId,
    }));
    return;
  }

  jobManager.subscribe(jobId, ws);

  ws.send(JSON.stringify({
    type: 'subscribed',
    jobId,
    state: job.state,
    operation: job.operation,
    steps: STATUS_STEPS[job.operation] || [],
  }));

  // If the job already completed or failed while the client was
  // connecting, send the terminal message immediately.
  if (job.state === 'complete' && job.result) {
    ws.send(JSON.stringify({
      type: 'job:complete',
      jobId,
      operation: job.operation,
      result: job.result,
      timestamp: new Date().toISOString(),
    }));
  } else if (job.state === 'failed' && job.error) {
    ws.send(JSON.stringify({
      type: 'job:failed',
      jobId,
      operation: job.operation,
      error: job.error,
      timestamp: new Date().toISOString(),
    }));
  } else if (job.state === 'running' && job.status) {
    ws.send(JSON.stringify({
      type: 'job:status',
      jobId,
      operation: job.operation,
      status: job.status,
      timestamp: new Date().toISOString(),
    }));
  }
}
