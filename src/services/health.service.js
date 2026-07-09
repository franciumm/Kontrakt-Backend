import mongoose from 'mongoose';
import Redis from 'ioredis';
import { config } from '../config/index.js';

let redisClient;

function getRedisClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
  }
  return redisClient;
}

async function checkMongo() {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, error: 'not connected' };
  }
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkRedis() {
  const client = getRedisClient();
  if (!client) return { ok: true, skipped: true };
  try {
    if (client.status !== 'ready') await client.connect();
    const pong = await client.ping();
    return { ok: pong === 'PONG' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getHealthStatus({ deep = false } = {}) {
  const base = {
    status: 'ok',
    service: 'Kontrakt Backend API',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  };

  if (!deep) return base;

  const [mongo, redis] = await Promise.all([checkMongo(), checkRedis()]);
  const healthy = mongo.ok && (redis.skipped || redis.ok);

  return {
    ...base,
    status: healthy ? 'ok' : 'degraded',
    checks: {
      mongodb: mongo,
      redis,
    },
  };
}

export async function closeHealthConnections() {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
}
