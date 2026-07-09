// Job manager singleton — in-memory by default, Redis when REDIS_URL is set.

import { InMemoryJobManager } from './inMemoryJobManager.js';
import { RedisJobManager } from './redisJobManager.js';

function createJobManager() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    // eslint-disable-next-line no-console
    console.log('[jobManager] Using Redis-backed job store');
    return new RedisJobManager(redisUrl);
  }
  return new InMemoryJobManager();
}

export const jobManager = createJobManager();
