// Redis-backed job manager with pub/sub for multi-instance deployments.
// Job metadata lives in Redis; WebSocket subscribers remain local per process.

import crypto from 'node:crypto';
import Redis from 'ioredis';
import { JOB_STATE } from '../constants/jobStatus.js';

const JOB_KEY_PREFIX = 'kontrakt:job:';
const JOB_EVENTS_CHANNEL = 'kontrakt:job:events';
const JOB_TTL_SECONDS = 5 * 60;

function serializeJob(job) {
  return JSON.stringify({
    jobId: job.jobId,
    userId: job.userId,
    operation: job.operation,
    state: job.state,
    status: job.status,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
  });
}

function deserializeJob(raw) {
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
    subscribers: new Set(),
  };
}

export class RedisJobManager {
  /**
   * @param {string} redisUrl
   */
  constructor(redisUrl) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    /** @type {Map<string, { subscribers: Set }>} */
    this.localJobs = new Map();

    this.subscriber.subscribe(JOB_EVENTS_CHANNEL);
    this.subscriber.on('message', (_channel, payload) => {
      try {
        const { jobId, message } = JSON.parse(payload);
        this._broadcastLocal(jobId, message);
      } catch {
        // Malformed pub/sub payload — ignore.
      }
    });
  }

  _jobKey(jobId) {
    return `${JOB_KEY_PREFIX}${jobId}`;
  }

  _ensureLocal(jobId) {
    if (!this.localJobs.has(jobId)) {
      this.localJobs.set(jobId, { subscribers: new Set() });
    }
    return this.localJobs.get(jobId);
  }

  async createJob(userId, operation) {
    const jobId = crypto.randomUUID();
    const job = {
      jobId,
      userId,
      operation,
      state: JOB_STATE.PENDING,
      status: null,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    await this.redis.setex(this._jobKey(jobId), JOB_TTL_SECONDS, serializeJob(job));
    this._ensureLocal(jobId);
    return { jobId };
  }

  async getJob(jobId) {
    const local = this.localJobs.get(jobId);
    const raw = await this.redis.get(this._jobKey(jobId));
    const job = deserializeJob(raw);
    if (!job) return undefined;
    if (local) job.subscribers = local.subscribers;
    else {
      job.subscribers = new Set();
      this.localJobs.set(jobId, { subscribers: job.subscribers });
    }
    return job;
  }

  subscribe(jobId, ws) {
    const local = this._ensureLocal(jobId);
    local.subscribers.add(ws);
    return true;
  }

  unsubscribe(ws) {
    for (const local of this.localJobs.values()) {
      local.subscribers.delete(ws);
    }
  }

  async emitStatus(jobId, status, data) {
    const job = await this.getJob(jobId);
    if (!job) return;
    job.state = JOB_STATE.RUNNING;
    job.status = status;
    await this.redis.setex(this._jobKey(jobId), JOB_TTL_SECONDS, serializeJob(job));

    const message = JSON.stringify({
      type: 'job:status',
      jobId,
      operation: job.operation,
      status,
      ...(data ? { data } : {}),
      timestamp: new Date().toISOString(),
    });

    await this._publish(jobId, message);
    this._broadcastLocal(jobId, message);
  }

  async completeJob(jobId, result) {
    const job = await this.getJob(jobId);
    if (!job) return;
    job.state = JOB_STATE.COMPLETE;
    job.result = result;
    await this.redis.setex(this._jobKey(jobId), JOB_TTL_SECONDS, serializeJob(job));

    const message = JSON.stringify({
      type: 'job:complete',
      jobId,
      operation: job.operation,
      result,
      timestamp: new Date().toISOString(),
    });

    await this._publish(jobId, message);
    this._broadcastLocal(jobId, message);
    this._scheduleLocalCleanup(jobId);
  }

  async failJob(jobId, error) {
    const job = await this.getJob(jobId);
    if (!job) return;
    job.state = JOB_STATE.FAILED;
    job.error = {
      message: error.message || 'Unknown error',
      code: error.code || error.statusCode || 'INTERNAL_ERROR',
    };
    await this.redis.setex(this._jobKey(jobId), JOB_TTL_SECONDS, serializeJob(job));

    const message = JSON.stringify({
      type: 'job:failed',
      jobId,
      operation: job.operation,
      error: job.error,
      timestamp: new Date().toISOString(),
    });

    await this._publish(jobId, message);
    this._broadcastLocal(jobId, message);
    this._scheduleLocalCleanup(jobId);
  }

  async _publish(jobId, message) {
    await this.redis.publish(JOB_EVENTS_CHANNEL, JSON.stringify({ jobId, message }));
  }

  _broadcastLocal(jobId, message) {
    const local = this.localJobs.get(jobId);
    if (!local) return;
    for (const ws of local.subscribers) {
      try {
        if (ws.readyState === 1) ws.send(message);
      } catch {
        // Dead connection.
      }
    }
  }

  _scheduleLocalCleanup(jobId) {
    setTimeout(() => {
      this.localJobs.delete(jobId);
    }, JOB_TTL_SECONDS * 1000);
  }

  async close() {
    this.localJobs.clear();
    await Promise.allSettled([
      this.subscriber.unsubscribe(JOB_EVENTS_CHANNEL),
      this.subscriber.quit(),
      this.redis.quit(),
    ]);
  }
}
