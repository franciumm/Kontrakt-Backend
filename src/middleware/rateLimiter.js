// Minimal in-process fixed-window rate limiter per client IP.
//
// We deliberately avoid pulling in `express-rate-limit` to keep the dependency
// surface small. This is good enough for a single-host deploy behind a load
// balancer that does connection pooling. For multi-host, swap in Redis-backed
// rate limiting (`rate-limit-redis`) before going production.

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX = 30; // 30 req/min/IP — tight enough to stop Fireworks-cost DoS

/**
 * @param {{ windowMs?: number, max?: number, message?: string }} opts
 */
export function rateLimit(opts = {}) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const max = opts.max ?? DEFAULT_MAX;
  const message = opts.message ?? 'Too many requests, please slow down.';

  // Map<ip, { count, windowStart }>. Cleared lazily on access.
  const buckets = new Map();

  // Periodic GC so a flood of unique IPs doesn't leak memory forever.
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
