import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, generateTestToken } from '../helpers/server.js';
import { clearTestDb } from '../helpers/db.js';

test('POST /api/auth/register — creates user and returns 201', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.email, 'alice@example.com');
    assert.ok(res.headers.get('set-cookie')?.includes('accessToken'));
  } finally {
    await close();
  }
});

test('POST /api/auth/login — valid credentials return 200', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: 'bob@example.com', password: 'password123' }),
    });

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.com', password: 'password123' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.email, 'bob@example.com');
  } finally {
    await close();
  }
});

test('POST /api/auth/login — invalid credentials return 401', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrongpassword' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('GET /api/auth/me — requires authentication', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('GET /api/auth/me — returns profile when authenticated', async () => {
  const { baseUrl, close } = await startServer({ withDb: true });
  try {
    await clearTestDb();
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Carol', email: 'carol@example.com', password: 'password123' }),
    });
    const cookie = registerRes.headers.get('set-cookie');

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.email, 'carol@example.com');
    assert.equal(body.data.name, 'Carol');
  } finally {
    await close();
  }
});

test('POST /api/audit/analyze — returns 401 without token', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/audit/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractText: 'test contract text here' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('GET /api/audit/:id — invalid ObjectId returns 400', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/audit/not-an-id`, {
      headers: { Authorization: `Bearer ${generateTestToken()}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_OBJECT_ID');
  } finally {
    await close();
  }
});
