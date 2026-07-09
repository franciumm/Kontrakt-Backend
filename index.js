import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import mongoose from 'mongoose';
import { connectDB } from './DB/DB.Connect.js';
import { attachWebSocketServer } from './src/ws/server.js';
import { jobManager } from './src/ws/jobManager.js';
import { closeHealthConnections } from './src/services/health.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const enableCluster =
  config.nodeEnv !== 'test' && process.env.CLUSTER === '1' && os.cpus().length > 1;

if (enableCluster && cluster.isPrimary) {
  const workers = os.cpus().length;
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (worker, code, signal) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[cluster] worker ${worker.process.pid} exited (code=${code} signal=${signal}); respawning`
    );
    cluster.fork();
  });
} else {
  startSingleProcess();
}

function startSingleProcess() {
  // Open the mongoose connection before serving. connectDB() exits on failure
  // (logs + process.exit(1)), so if it returns we have a live DB. Tests import
  // createApp() directly and never run this file, so they stay DB-free.
  connectDB().then(() => {
    listenWithShutdown();
  });
}

function listenWithShutdown() {
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(
      `Kontrakt API listening on port ${config.port} in ${config.nodeEnv} mode` +
        (enableCluster ? ` (worker ${process.pid})` : '')
    );
  });

  // Attach WebSocket server to the same HTTP server (path: /ws).
  const wss = attachWebSocketServer(server);

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[shutdown] ${signal} received — draining connections`);

    const forceExit = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[shutdown] timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref?.();

    try {
      wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
      await jobManager.close?.();
      await mongoose.disconnect();
      await closeHealthConnections();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shutdown] error during cleanup', err);
      process.exit(1);
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => shutdown(signal));
  }
}

