// Per-process concurrency semaphore (ticket SEC-104).
//
// The rate limiter (rateLimiter.js) bounds requests-per-second per IP but
// cannot stop a botnet of distinct IPs from simultaneously submitting PDFs
// and exhausting Node memory via concurrent pdf-render + vision calls.
// This semaphore caps the number of in-flight heavy requests in this
// process. For multi-host deploys, pair with cluster mode (index.js) so the
// total cap = workers × perWorkerCap.
//
// Over-cap requests get 503 + Retry-After — they should retry, not be queued
// (queueing would multiply memory pressure under load).

const DEFAULT_MAX_CONCURRENT = 3;

/**
 * @param {{ max?: number, message?: string, retryAfterSec?: number }} opts
 */
export function concurrencyCap(opts = {}) {
  const max = opts.max ?? DEFAULT_MAX_CONCURRENT;
  const retryAfterSec = opts.retryAfterSec ?? 10;
  const message = opts.message ?? 'Server is busy processing other requests. Please retry shortly.';
  let inFlight = 0;

  return function _concurrencyCap(req, res, next) {
    if (inFlight >= max) {
      res.setHeader('Retry-After', retryAfterSec);
      const err = new Error(message);
      err.statusCode = 503;
      err.code = 'SERVER_BUSY';
      return next(err);
    }
    inFlight += 1;
    // Release on both finish (success) and close (client disconnect) — whichever
    // fires first. `res.once` avoids double-decrement.
    const release = () => {
      inFlight = Math.max(0, inFlight - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
