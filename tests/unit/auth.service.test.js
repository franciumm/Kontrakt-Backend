// auth.service unit tests — DB-free via an in-memory userStore.
// Covers the full register/login/refresh/logout cycle including the pasted
// pattern's refresh-token reuse detection (revoke all sessions on replay).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AuthService } from '../../src/services/auth.service.js';
import { AppError } from '../../src/utils/AppError.js';

// Minimal in-memory store implementing the UserStore interface.
function makeStore() {
  const users = new Map();
  let seq = 0;
  const id = () => `u_${++seq}`;
  return {
    users,
    async findByEmail(email) {
      for (const u of users.values()) if (u.email === email.toLowerCase()) return u;
      return null;
    },
    async findById(i) {
      return users.get(String(i)) || null;
    },
    async create({ name, email, password }) {
      const _id = id();
      const u = { _id, name, email: email.toLowerCase(), password, role: 'freelancer', refreshTokens: [] };
      users.set(_id, u);
      return u;
    },
    async addRefreshToken(userId, hashed) {
      const u = users.get(String(userId));
      if (u) u.refreshTokens.push(hashed);
      return u;
    },
    async replaceRefreshToken(userId, oldHash, newHash) {
      const u = users.get(String(userId));
      if (!u) return null;
      const idx = u.refreshTokens.indexOf(oldHash);
      if (idx === -1) return null;
      u.refreshTokens[idx] = newHash;
      return u;
    },
    async removeRefreshToken(userId, hashed) {
      const u = users.get(String(userId));
      if (u) u.refreshTokens = u.refreshTokens.filter((t) => t !== hashed);
      return u;
    },
    async removeAllRefreshTokens(userId) {
      const u = users.get(String(userId));
      if (u) u.refreshTokens = [];
      return u;
    },
  };
}

test('register — creates a user, returns tokens, stores hashed refresh token', async () => {
  const store = makeStore();
  const svc = new AuthService(store);
  const { user, accessToken, refreshToken } = await svc.register('Alice', 'alice@example.com', 'password123');
  assert.equal(user.email, 'alice@example.com');
  assert.equal(typeof accessToken, 'string');
  assert.equal(typeof refreshToken, 'string');
  const stored = store.users.get(user._id);
  assert.equal(stored.refreshTokens.length, 1, 'hashed refresh token stored');
  assert.notEqual(stored.refreshTokens[0], refreshToken, 'stored token must be hashed, not plaintext');
  assert.notEqual(stored.password, 'password123', 'password must be bcrypt-hashed, not plaintext');
});

test('register — duplicate email throws 409', async () => {
  const svc = new AuthService(makeStore());
  await svc.register('Alice', 'alice@example.com', 'password123');
  await assert.rejects(
    () => svc.register('Alice 2', 'alice@example.com', 'password456'),
    (err) => err instanceof AppError && err.statusCode === 409 && err.code === 'EMAIL_TAKEN'
  );
});

test('login — happy path issues tokens; bad password returns same error as unknown email (no enumeration)', async () => {
  const svc = new AuthService(makeStore());
  await svc.register('Alice', 'alice@example.com', 'password123');

  const ok = await svc.login('alice@example.com', 'password123');
  assert.equal(ok.accessToken.split('.').length, 3);

  // Unknown email
  await assert.rejects(
    () => svc.login('ghost@example.com', 'password123'),
    (err) => err.statusCode === 400 && err.code === 'INVALID_CREDENTIALS'
  );
  // Wrong password — identical error code+message so attackers can't enumerate emails.
  await assert.rejects(
    () => svc.login('alice@example.com', 'wrong'),
    (err) => err.statusCode === 400 && err.code === 'INVALID_CREDENTIALS'
  );
});

test('refreshSession — rotates the refresh token; old token is no longer valid', async () => {
  const svc = new AuthService(makeStore());
  await svc.register('Alice', 'alice@example.com', 'password123');
  const { refreshToken: r1 } = await svc.login('alice@example.com', 'password123');

  const { accessToken, refreshToken: r2 } = await svc.refreshSession(r1);
  assert.equal(accessToken.split('.').length, 3);
  assert.notEqual(r1, r2, 'refresh token must rotate');

  // Old token was replaced — reusing it triggers reuse detection.
  await assert.rejects(
    () => svc.refreshSession(r1),
    (err) => err.statusCode === 403 && err.code === 'REFRESH_TOKEN_REUSE'
  );
});

test('refreshSession — reuse detection revokes ALL sessions for the user', async () => {
  // Two devices log in → two valid refresh tokens. One is replayed → both revoked.
  const store = makeStore();
  const svc = new AuthService(store);
  await svc.register('Alice', 'alice@example.com', 'password123');
  const { refreshToken: r1 } = await svc.login('alice@example.com', 'password123');
  const { refreshToken: r2 } = await svc.login('alice@example.com', 'password123');

  // Rotate r1 once (normal use on device 1).
  await svc.refreshSession(r1);

  // r1 is now stale. Replaying it looks like an attacker with a stolen older token.
  await assert.rejects(() => svc.refreshSession(r1), /compromised/i);

  // Reuse detection must have wiped BOTH sessions — even r2 (still "fresh") is dead.
  await assert.rejects(
    () => svc.refreshSession(r2),
    (err) => err.statusCode === 403 && err.code === 'REFRESH_TOKEN_REUSE',
    'reuse detection must revoke all sibling sessions'
  );
});

test('refreshSession — missing / invalid token → 401 / 403', async () => {
  const svc = new AuthService(makeStore());
  await assert.rejects(
    () => svc.refreshSession(null),
    (err) => err.statusCode === 401 && err.code === 'REFRESH_TOKEN_MISSING'
  );
  await assert.rejects(
    () => svc.refreshSession('garbage'),
    (err) => err.statusCode === 403 && err.code === 'REFRESH_TOKEN_INVALID'
  );
});

test('logout — removes only the supplied refresh token', async () => {
  const store = makeStore();
  const svc = new AuthService(store);
  const { user } = await svc.register('Alice', 'alice@example.com', 'password123');
  // register stores one refresh token; each login stores another.
  const { refreshToken: r1 } = await svc.login('alice@example.com', 'password123');
  const { refreshToken: r2 } = await svc.login('alice@example.com', 'password123');
  assert.equal(store.users.get(user._id).refreshTokens.length, 3);

  await svc.logout(user._id, r1);
  assert.equal(store.users.get(user._id).refreshTokens.length, 2, 'only r1 removed');
  // r2 still usable
  const refreshed = await svc.refreshSession(r2);
  assert.equal(refreshed.accessToken.split('.').length, 3);
});

test('verifyAccessToken — happy path + missing/expired', async () => {
  const svc = new AuthService(makeStore());
  const { accessToken } = await svc.register('Alice', 'alice@example.com', 'password123');
  const payload = svc.verifyAccessToken(accessToken);
  assert.equal(payload.email, 'alice@example.com');
  assert.ok(payload._id);

  assert.throws(
    () => svc.verifyAccessToken(null),
    (err) => err.statusCode === 401 && err.code === 'AUTH_REQUIRED'
  );
  assert.throws(
    () => svc.verifyAccessToken('not-a-jwt'),
    (err) => err.statusCode === 401 && err.code === 'AUTH_INVALID'
  );
});
