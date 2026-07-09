# Kontrakt — Production Deployment Guide

Target platform: **Railway** (single instance for MVP).

## Pre-deploy checklist

### 1. Environment variables (Railway dashboard)

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | yes | `production` |
| `FIREWORKS_API_KEY` | yes | Fireworks API key |
| `MONGO_URI` | yes | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | yes | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | yes | Strong random hex |
| `JWT_EXTRACT_SECRET` | yes | Strong random hex |
| `CORS_ORIGINS` | yes | Comma-separated frontend origins, e.g. `https://app.example.com` |
| `GEMMA_MODEL` | yes | Fireworks deployment ID for fast-scan + vision OCR |
| `AMD_CLASSIFIER_BASE_URL` | yes | Layer 5 injection classifier endpoint |
| `AMD_CLASSIFIER_API_KEY` | if required | Classifier API key |
| `REDIS_URL` | recommended | Required for multi-replica; optional for single instance |
| `CLUSTER` | no | **Leave unset** until Redis job store is configured |

Optional: `PORT` (Railway sets automatically), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `CLASSIFIER_MODEL`.

### 2. MongoDB Atlas

1. Create a cluster and database user.
2. Allow Railway egress IPs (or `0.0.0.0/0` for MVP).
3. Set `MONGO_URI` in Railway.
4. Indexes on `userId` are declared in Mongoose schemas (`Contract`, `Audit`) and created on first write.

### 3. AMD classifier (Layer 5)

Deploy the Qwen 2.5 7B classifier per `docs/AMD _CLOUD_SETUP.MD`. Set `AMD_CLASSIFIER_BASE_URL`.

On classifier outage the API **fail-opens**: audit flags are returned with `meta.classifierHealthy: false`.

### 4. Railway service settings

- **Builder:** Dockerfile (`railway.json` already configured)
- **Health check:** `GET /api/health` (deep check at `GET /api/health?deep=1`)
- **Replicas:** **1** for MVP (in-memory jobs break across replicas without Redis)

### 5. Frontend integration

1. Auth: `POST /api/auth/login` → use `Authorization: Bearer <accessToken>` for cross-origin (CORS uses `credentials: false`).
2. WebSocket: connect to `wss://<host>/ws?token=<accessToken>` before heavy POSTs.
3. Job flow: WS connect → subscribe pattern → `POST` → `{ jobId }` → `subscribe` → `job:status` / `job:complete`.

### 6. Deploy

```bash
# From project root — push to GitHub; Railway auto-deploys on connect.
# Or use Railway CLI:
railway up
```

### 7. Post-deploy smoke test

```bash
curl https://<your-app>.up.railway.app/api/health
curl "https://<your-app>.up.railway.app/api/health?deep=1"
```

## Scaling beyond single instance

Before enabling multiple replicas or `CLUSTER=1`:

1. Provision Redis and set `REDIS_URL`.
2. Job state and rate-limit buckets are shared automatically when Redis is configured.
3. WebSocket clients can connect to any replica; job events are pub/sub'd across instances.

## Secrets management (SEC-103 follow-up)

Migrate from flat env vars to AWS Secrets Manager, GCP Secret Manager, or Vault. The logger redacts sensitive field names before output.
