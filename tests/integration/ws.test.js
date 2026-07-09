import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { startServer, generateTestToken, waitForWsMessage } from '../helpers/server.js';
import { mockCreate, streamResponse } from '../helpers/fireworks-mock.js';
import { jobManager } from '../../src/ws/jobManager.js';
import { OPERATIONS } from '../../src/constants/jobStatus.js';

test('WebSocket — rejects connection without token', async () => {
  const { wsUrl, close } = await startServer({ withWs: true });
  try {
    const ws = new WebSocket(wsUrl);
    const closed = new Promise((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    const code = await closed;
    assert.equal(code, 4401);
  } finally {
    await close();
  }
});

test('WebSocket — connects with valid token and receives connected', async () => {
  const { wsUrl, close } = await startServer({ withWs: true });
  try {
    const token = generateTestToken();
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    const msg = await waitForWsMessage(ws, 'connected');
    assert.ok(msg.userId);
    assert.ok(msg.timestamp);
    ws.close();
  } finally {
    await close();
  }
});

test('WebSocket — subscribe to job receives status and complete', async () => {
  const { wsUrl, close } = await startServer({ withWs: true });
  const userId = '000000000000000000000000';
  const token = generateTestToken(userId);

  try {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    await waitForWsMessage(ws, 'connected');

    const { jobId } = await jobManager.createJob(userId, OPERATIONS.AUDIT_FAST_SCAN);

    ws.send(JSON.stringify({ type: 'subscribe', jobId }));
    const subscribed = await waitForWsMessage(ws, 'subscribed');
    assert.equal(subscribed.jobId, jobId);
    assert.equal(subscribed.operation, OPERATIONS.AUDIT_FAST_SCAN);

    await jobManager.emitStatus(jobId, 'scanning');
    const statusMsg = await waitForWsMessage(ws, 'job:status');
    assert.equal(statusMsg.status, 'scanning');

    await jobManager.completeJob(jobId, { trapCount: 2 });
    const completeMsg = await waitForWsMessage(ws, 'job:complete');
    assert.equal(completeMsg.result.trapCount, 2);

    ws.close();
  } finally {
    await jobManager.close?.();
    await close();
  }
});

test('WebSocket — cannot subscribe to another user job', async () => {
  const { wsUrl, close } = await startServer({ withWs: true });
  const token = generateTestToken('aaaaaaaaaaaaaaaaaaaaaaaa');

  try {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    await waitForWsMessage(ws, 'connected');

    const { jobId } = await jobManager.createJob('bbbbbbbbbbbbbbbbbbbbbbbb', OPERATIONS.AUDIT_ANALYZE);
    ws.send(JSON.stringify({ type: 'subscribe', jobId }));

    const errMsg = await waitForWsMessage(ws, 'error');
    assert.match(errMsg.message, /unauthorized/i);
    ws.close();
  } finally {
    await jobManager.close?.();
    await close();
  }
});

test('POST /api/audit/fast-scan — 202 + WS job:complete end-to-end', async () => {
  const mock = mockCreate(() =>
    streamResponse([{ choices: [{ delta: { content: '{"trapCount":3}' } }] }])
  );

  const { baseUrl, wsUrl, close } = await startServer({ withWs: true });
  const token = generateTestToken();

  try {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    await waitForWsMessage(ws, 'connected');

    const res = await fetch(`${baseUrl}/api/audit/fast-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contractText: 'Unlimited revisions until satisfied.' }),
    });
    assert.equal(res.status, 202);
    const { jobId } = await res.json();
    assert.ok(jobId);

    ws.send(JSON.stringify({ type: 'subscribe', jobId }));
    await waitForWsMessage(ws, 'subscribed');

    const complete = await waitForWsMessage(ws, 'job:complete', 15_000);
    assert.equal(complete.result.trapCount, 3);
    ws.close();
  } finally {
    mock.restore();
    await close();
  }
});
