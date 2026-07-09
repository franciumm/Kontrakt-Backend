import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import { connectDB } from './DB/DB.Connect.js';

// Cluster mode (ticket SEC-104). One worker per CPU core shares the listen
// port; each worker owns its own concurrency semaphore, so the host-level
// cap on concurrent heavy work = (workers × perWorkerCap). The primary only
// forks and respawns — no request handling.
//
// Disabled in test mode (tests import createApp() directly) and explicitly
// opt-in via CLUSTER=1 in other environments, so a single-process `npm start`
// in dev remains the simple path.
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
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `Kontrakt API listening on port ${config.port} in ${config.nodeEnv} mode` +
        (enableCluster ? ` (worker ${process.pid})` : '')
    );
  });

  // Graceful shutdown — in production behind a load balancer this lets in-flight
  // requests finish before the process exits.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}
