// Auth service (adapted to Kontrakt from the supplied AuthService pattern).
//
// Covers: register / login / refreshSession / logout / getMe — the identity
// layer that ticket SEC-108's extract→analyze binding rides on.
//
// Skipped from the pasted pattern: OTP reset + deleteAccount (need email +
// cascade-delete wiring that's out of scope for the audit-only backend). The
// token mechanics those endpoints would need are already here (JWT access +
// hashed refresh tokens with reuse detection).
//
// Dependency-injected: tests pass an in-memory userStore; production wires
// the default Mongoose-backed store (no DB during the unit suite).

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';

/**
 * @typedef {Object} UserStore
 * @property {(email: string) => Promise<any>} findByEmail
 * @property {(id: string) => Promise<any>} findById
 * @property {(data: { name: string, email: string, password: string }) => Promise<any>} create
 * @property {(userId: string, hashedToken: string) => Promise<any>} addRefreshToken
 * @property {(userId: string, oldHash: string, newHash: string) => Promise<any>} replaceRefreshToken
 * @property {(userId: string, hashedToken: string) => Promise<any>} removeRefreshToken
 * @property {(userId: string) => Promise<any>} removeAllRefreshTokens
 */

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  /**
   * @param {UserStore} userStore
   */
  constructor(userStore) {
    if (!userStore) throw new Error('AuthService requires a userStore');
    this.userStore = userStore;
  }

  _generateTokens(user) {
    const base = { id: String(user._id), email: user.email };
    // Per-token `jti` (JWT ID) guarantees uniqueness even when two tokens for
    // the same user are issued within the same second — otherwise jwt.sign is
    // deterministic and the two tokens would be byte-identical, defeating
    // rotation and reuse detection.
    const accessToken = jwt.sign({ ...base, jti: crypto.randomUUID() }, config.auth.jwtAccessSecret, {
      expiresIn: config.auth.accessTokenExpiresIn,
    });
    const refreshToken = jwt.sign({ ...base, jti: crypto.randomUUID() }, config.auth.jwtRefreshSecret, {
      expiresIn: config.auth.refreshTokenExpiresIn,
    });
    return { accessToken, refreshToken };
  }

  _toPublicUser(user) {
    if (!user) return null;
    return {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async register(name, email, password) {
    const existing = await this.userStore.findByEmail(email);
    if (existing) {
      throw new AppError('Email already exists', 409, 'EMAIL_TAKEN');
    }
    const hashedPassword = await bcrypt.hash(password, config.auth.saltRounds);
    const user = await this.userStore.create({ name, email, password: hashedPassword });

    const { accessToken, refreshToken } = this._generateTokens(user);
    await this.userStore.addRefreshToken(String(user._id), hashToken(refreshToken));
    return { user: this._toPublicUser(user), accessToken, refreshToken };
  }

  async login(email, password) {
    const user = await this.userStore.findByEmail(email);
    if (!user) {
      // Identical message for "no user" and "bad password" — no email enumeration.
      throw new AppError('Invalid email or password', 400, 'INVALID_CREDENTIALS');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new AppError('Invalid email or password', 400, 'INVALID_CREDENTIALS');
    }
    const { accessToken, refreshToken } = this._generateTokens(user);
    await this.userStore.addRefreshToken(String(user._id), hashToken(refreshToken));
    return { user: this._toPublicUser(user), accessToken, refreshToken };
  }

  async refreshSession(incomingRefreshToken) {
    if (!incomingRefreshToken) {
      throw new AppError('Refresh token missing', 401, 'REFRESH_TOKEN_MISSING');
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, config.auth.jwtRefreshSecret);
    } catch (err) {
      throw new AppError('Refresh token invalid or expired', 403, 'REFRESH_TOKEN_INVALID');
    }

    const user = await this.userStore.findById(String(decoded.id));
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const hashedIncoming = hashToken(incomingRefreshToken);
    const { accessToken, refreshToken } = this._generateTokens(user);
    const hashedNew = hashToken(refreshToken);

    const updated = await this.userStore.replaceRefreshToken(
      String(user._id),
      hashedIncoming,
      hashedNew
    );

    if (!updated) {
      // Token reuse detection: the incoming token wasn't in the store — it was
      // either already rotated, or someone is replaying a stolen older token.
      // Revoke every session to be safe. This is the pasted pattern's defense.
      await this.userStore.removeAllRefreshTokens(String(user._id));
      throw new AppError('Refresh token compromised or revoked', 403, 'REFRESH_TOKEN_REUSE');
    }

    return { accessToken, refreshToken };
  }

  async logout(userId, refreshToken) {
    if (!refreshToken) return;
    await this.userStore.removeRefreshToken(userId, hashToken(refreshToken));
  }

  /**
   * Verify an access token from the Authorization header or cookie. Returns the
   * public user payload, or throws AppError(401). Used by requireAuth middleware.
   */
  verifyAccessToken(token) {
    if (!token) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }
    let decoded;
    try {
      decoded = jwt.verify(token, config.auth.jwtAccessSecret);
    } catch (err) {
      throw new AppError('Invalid or expired access token', 401, 'AUTH_INVALID');
    }
    return { _id: String(decoded.id), email: decoded.email };
  }
}
