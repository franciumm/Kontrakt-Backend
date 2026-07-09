// Rate limiter — in-process by default; Redis-backed when REDIS_URL is set.

import Redis from 'ioredis';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;

let sharedRedis;

function getRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!sharedRedis) {
    sharedRedis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  }
  return sharedRedis;
}

function inMemoryRateLimit(windowMs, max, message) {
  const buckets = new Map();
  const gc = setInterval(() => buckets.clear(), windowMs);
  gc.unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      const err = new Error(message);
      err.statusCode = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      return next(err);
    }
    next();
  };
}

function redisRateLimit(windowMs, max, message) {
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `kontrakt:rl:${ip}`;
    const redis = getRedis();

    try {
      if (redis.status !== 'ready') await redis.connect();
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) {
        res.setHeader('Retry-After', windowSec);
        const err = new Error(message);
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        return next(err);
      }
      next();
    } catch {
      // Redis unavailable — fall back to allowing the request rather than blocking all traffic.
      next();
    }
  };
}

/**
 * @param {{ windowMs?: number, max?: number, message?: string }} opts
 */
export function rateLimit(opts = {}) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const max = opts.max ?? DEFAULT_MAX;
  const message = opts.message ?? 'Too many requests, please slow down.';

  if (process.env.REDIS_URL?.trim()) {
    return redisRateLimit(windowMs, max, message);
  }
  return inMemoryRateLimit(windowMs, max, message);
}
