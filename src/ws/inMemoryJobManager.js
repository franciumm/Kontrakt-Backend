// In-memory job lifecycle manager. Creates jobs, emits status updates to
// subscribed WebSocket clients, and auto-cleans completed jobs.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JOB_STATE } from '../constants/jobStatus.js';

const JOB_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes after completion

export class InMemoryJobManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, Job>} */
    this.jobs = new Map();
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
      subscribers: new Set(),
      createdAt: new Date(),
    };
    this.jobs.set(jobId, job);
    return { jobId };
  }

  async getJob(jobId) {
    return this.jobs.get(jobId);
  }

  subscribe(jobId, ws) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.subscribers.add(ws);
    return true;
  }

  unsubscribe(ws) {
    for (const job of this.jobs.values()) {
      job.subscribers.delete(ws);
    }
  }

  async emitStatus(jobId, status, data) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.state = JOB_STATE.RUNNING;
    job.status = status;

    const message = JSON.stringify({
      type: 'job:status',
      jobId,
      operation: job.operation,
      status,
      ...(data ? { data } : {}),
      timestamp: new Date().toISOString(),
    });

    this._broadcast(job, message);
  }

  async completeJob(jobId, result) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.state = JOB_STATE.COMPLETE;
    job.result = result;

    const message = JSON.stringify({
      type: 'job:complete',
      jobId,
      operation: job.operation,
      result,
      timestamp: new Date().toISOString(),
    });

    this._broadcast(job, message);
    this._scheduleCleanup(jobId);
  }

  async failJob(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.state = JOB_STATE.FAILED;
    job.error = {
      message: error.message || 'Unknown error',
      code: error.code || error.statusCode || 'INTERNAL_ERROR',
    };

    const message = JSON.stringify({
      type: 'job:failed',
      jobId,
      operation: job.operation,
      error: job.error,
      timestamp: new Date().toISOString(),
    });

    this._broadcast(job, message);
    this._scheduleCleanup(jobId);
  }

  _broadcast(job, message) {
    for (const ws of job.subscribers) {
      try {
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(message);
        }
      } catch {
        // Connection dead — cleaned up on close event.
      }
    }
  }

  _scheduleCleanup(jobId) {
    setTimeout(() => {
      this.jobs.delete(jobId);
    }, JOB_CLEANUP_DELAY_MS);
  }

  async close() {
    this.jobs.clear();
  }
}
