import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, generateTestToken } from '../helpers/server.js';
import { clearTestDb } from '../helpers/db.js';
import { mockCreate, chatResponse } from '../helpers/fireworks-mock.js';

async function registerAndGetCookie(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Contract User',
      email: `user-${Date.now()}@example.com`,
      password: 'password123',
    }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie');
}

test('POST /api/contract/start — returns 401 without auth', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/contract/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gigDescription: 'Logo design for startup' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('POST /api/contract/start — returns 202 with jobId', async () => {
  const mock = mockCreate(() =>
    chatResponse(JSON.stringify({ gigType: 'design', entities: ['logo'] }))
  );

  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    const cookie = await registerAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/contract/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ gigDescription: 'I need a logo design for my coffee shop brand.' }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.ok(body.jobId);
  } finally {
    mock.restore();
    await close();
  }
});

test('POST /api/contract/answer — invalid contractId returns 400', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/contract/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateTestToken()}`,
      },
      body: JSON.stringify({ contractId: 'not-valid', answers: { scope: 'logo only' } }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    await close();
  }
});

test('GET /api/contract/:id — invalid ObjectId returns 400', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/contract/bad-id`, {
      headers: { Authorization: `Bearer ${generateTestToken()}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_OBJECT_ID');
  } finally {
    await close();
  }
});

test('GET /api/contract/history — returns empty list for new user', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    const cookie = await registerAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/contract/history`, {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.data, []);
    assert.equal(body.pagination.total, 0);
  } finally {
    await close();
  }
});
