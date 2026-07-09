# Kontrakt Backend — Vision & Execution Plan

> All architectural decisions resolved. This is the source-of-truth roadmap for deployment readiness.

---

## Resolved Decisions Summary

| Decision | Answer |
|----------|--------|
| **Gemma model** | `accounts/francium/deployments/qi296nit` (Gemma 4 31B IT) |
| **Vision OCR** | **Switch from AMD Cloud → Fireworks deployment** (same `qi296nit`) |
| **Auth** | **Required everywhere** — audit, contract, WebSocket. Current unauthenticated audit = bug |
| **Data persistence** | **Yes** — save audits + contracts to MongoDB for logged-in users |
| **Demo preset cache** | **No** — no contract preset cache needed |
| **WebSocket library** | `ws` (lightweight, predictable) |
| **WebSocket flow** | HTTP triggers job → returns `202 { jobId }` → all results via WebSocket |
| **Deployment target** | Railway (recommended) |

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │                 FRONTEND                        │
                    │                                                 │
                    │  1. POST /api/auth/login  (get JWT cookies)     │
                    │  2. Connect ws://host/ws?token=JWT              │
                    │  3. POST /api/audit/analyze  → { jobId }        │
                    │  4. WS receives: status → status → result       │
                    └──────────┬──────────────────────┬───────────────┘
                               │ HTTP                  │ WebSocket
                    ┌──────────▼──────────┐   ┌───────▼───────────┐
                    │   Express Routes     │   │   WS Server (ws)  │
                    │   requireAuth on ALL │   │   JWT auth on     │
                    │                      │   │   connection       │
                    │   Returns 202 +      │   │                   │
                    │   jobId immediately   │   │   Sends:          │
                    └──────────┬───────────┘   │   - job:status     │
                               │               │   - job:complete   │
                    ┌──────────▼───────────┐   │   - job:failed     │
                    │    Job Manager        │───┘                   │
                    │    (in-memory)        │───────────────────────┘
                    │                       │
                    │  createJob()          │
                    │  emitStatus()         │
                    │  completeJob()        │
                    │  failJob()            │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                     ▼
   ┌──────────────┐   ┌──────────────┐    ┌──────────────────┐
   │ Audit Service │   │ Contract     │    │ MongoDB          │
   │ (5-layer      │   │ Assembly +   │    │ (User, Audit,    │
   │  security)    │   │ Graph Walker │    │  Contract models)│
   └──────┬───────┘   └──────┬───────┘    └──────────────────┘
          │                   │
          ▼                   ▼
   ┌──────────────────────────────────┐
   │ Fireworks API (single provider)  │
   │                                   │
   │ glm-5p2          → deep audit     │
   │ qi296nit (gemma)  → fast-scan     │
   │ qi296nit (gemma)  → vision OCR    │
   └──────────────────────────────────┘
```

> **Major change:** Vision OCR moves FROM the AMD Cloud endpoints (`36.150.116.194`) TO the Fireworks deployment (`qi296nit`). The AMD provider (`amd.provider.js`) serves only the injection classifier (which stays on AMD at `:8001`).

---

## Current Feature Status

### ✅ Already Working (needs refactoring only)

| Feature | Current State | What Changes |
|---------|--------------|--------------|
| Deep Audit | Returns result via HTTP | → Return `202 { jobId }`, emit status + result via WS, save to MongoDB |
| Fast Scan | Streams NDJSON via HTTP | → Return `202 { jobId }`, emit status + result via WS |
| PDF Extract | Returns result via HTTP | → Return `202 { jobId }`, emit status + result via WS |
| Auth | Works, not enforced on audit | → Add `requireAuth` to ALL audit + contract routes |

### ❌ Must Be Built

| Feature | What's Needed |
|---------|--------------|
| WebSocket infrastructure | `ws` server, job manager, WS auth |
| Contract Interrogator routes | HTTP endpoints (trigger jobs) |
| Contract persistence | CRUD service wiring to `Contract.Model` |
| Audit persistence | Save-to-DB logic for `Audit.Model` |
| Vision OCR provider switch | Move from AMD → Fireworks |
| Deployment config | Dockerfile, Railway config |

### 🔧 Must Be Fixed

| Bug | Location | Fix |
|-----|----------|-----|
| `$defs`/`$ref` schema rejected by Fireworks | `src/services/contractAssembly.service.js:7-25` | Inline to root `type: "object"` |
| Fast-scan model ID wrong | `src/services/audit.service.js:14` | Change to `accounts/francium/deployments/qi296nit` |
| Vision OCR points to AMD | `src/services/vision.service.js` | Switch to Fireworks provider with `qi296nit` |
| Audit routes have no auth | `src/routes/audit.routes.js` | Add `requireAuth` to all 3 endpoints |
| `.env.example` missing vars | `.env.example` | Add `JWT_EXTRACT_SECRET`, `AMD_CLASSIFIER_BASE_URL`, `CLASSIFIER_MODEL` |
| `GEMMA_MODEL` empty in `.env` | `.env` | Set to `accounts/francium/deployments/qi296nit` |
| No `engines` in `package.json` | `package.json` | Add `"engines": { "node": ">=18" }` |

---

## Execution Plan (8 Phases)

### Phase 1: Fix Existing Bugs

| # | Task | File(s) |
|---|------|---------|
| 1 | Fix `contractAssembly.service.js` — inline `$defs`/`$ref` schema to root `type: "object"` | `src/services/contractAssembly.service.js` |
| 2 | Update fast-scan model to `accounts/francium/deployments/qi296nit` | `src/services/audit.service.js` |
| 3 | Switch vision OCR from AMD provider to Fireworks provider with `qi296nit` | `src/services/vision.service.js` |
| 4 | Add `requireAuth` middleware to all audit routes | `src/routes/audit.routes.js` |
| 5 | Update `.env` — set `GEMMA_MODEL=accounts/francium/deployments/qi296nit` | `.env` |
| 6 | Update `.env.example` — add missing vars | `.env.example` |
| 7 | Add `"engines"` to `package.json` | `package.json` |

### Phase 2: Install Dependencies + WebSocket Infrastructure

| # | Task | File(s) |
|---|------|---------|
| 8 | Install `ws` package | `package.json` |
| 9 | Create job status constants | `src/constants/jobStatus.js` |
| 10 | Create Job Manager — in-memory job store with status lifecycle | `src/ws/jobManager.js` |
| 11 | Create WS auth — verify JWT on connection upgrade | `src/ws/auth.js` |
| 12 | Create WS server — attach to HTTP server, handle connections, route messages | `src/ws/server.js` |
| 13 | Refactor `index.js` — expose HTTP server for WS attachment | `index.js` |

### Phase 3: Refactor Audit Endpoints to Job-Based

| # | Task | File(s) |
|---|------|---------|
| 14 | Refactor `extractPdfText` → create job → 202 → async process → emit via WS | `src/controllers/audit.controller.js` |
| 15 | Refactor `analyzeContract` → create job → 202 → async process → emit via WS | `src/controllers/audit.controller.js` |
| 16 | Refactor `fastScanContract` → create job → 202 → async process → emit via WS | `src/controllers/audit.controller.js` |
| 17 | Add status emit points inside `audit.service.js` (sanitizing → classifier → auditing → validating) | `src/services/audit.service.js` |

### Phase 4: Build Contract Interrogator Flow

| # | Task | File(s) |
|---|------|---------|
| 18 | Create Zod schemas for contract endpoints | `src/validators/contract.schema.js` |
| 19 | Create contract orchestration service (calls graphWalker + contractAssembly) | `src/services/contract.service.js` |
| 20 | Create contract controller — all endpoints as job-based | `src/controllers/contract.controller.js` |
| 21 | Create contract routes with `requireAuth` + validators | `src/routes/contract.routes.js` |
| 22 | Mount contract routes in router index | `src/routes/index.js` |

### Phase 5: Data Persistence

| # | Task | File(s) |
|---|------|---------|
| 23 | Wire `Audit.Model` — save audit results on job completion + list/get history endpoints | `src/services/audit.service.js`, `src/controllers/audit.controller.js` |
| 24 | Wire `Contract.Model` — save contract on generation + list/get history endpoints | `src/services/contract.service.js`, `src/controllers/contract.controller.js` |
| 25 | Add history routes: `GET /api/audit/history`, `GET /api/contract/history`, `GET /api/contract/:id` | Routes files |

### Phase 6: Deployment Configuration

| # | Task | File(s) |
|---|------|---------|
| 26 | Create `Dockerfile` (multi-stage: install → prune devDeps → run) | `Dockerfile` |
| 27 | Create `.dockerignore` | `.dockerignore` |
| 28 | Create Railway config or equivalent | `railway.json` |

### Phase 7: Cleanup

- Delete empty stubs: `base.controller.js`, `health.controller.js`, `health.routes.js`
- Or implement them if needed

### Phase 8: Verification

| # | Task |
|---|------|
| 29 | Run full test suite (`npm test`) — update/add tests for new job-based flow, auth on audit, vision provider switch |
| 30 | Manual E2E: register → login → WS connect → trigger audit → receive status updates → verify result saved to MongoDB |
| 31 | Manual E2E: login → WS connect → start contract → answer questions → generate → verify saved |
| 32 | Deploy to Railway → verify WS works over wss:// |

---

## WebSocket Protocol Reference

### Connection
```
ws://host/ws
```
Server automatically verifies the JWT `accessToken` from `HttpOnly` cookies on connection. Alternatively, clients can send a `{ "type": "auth", "token": "..." }` message within 5 seconds. Rejects with `4401` close code if invalid/expired or missing.

### Client → Server Messages
```jsonc
// Subscribe to a job's updates
{ "type": "subscribe", "jobId": "abc123" }
```

### Server → Client Messages
```jsonc
// Status update
{
  "type": "job:status",
  "jobId": "abc123",
  "operation": "audit:analyze",
  "status": "sanitizing",
  "timestamp": "2026-07-08T..."
}

// Job complete — includes full result
{
  "type": "job:complete",
  "jobId": "abc123",
  "operation": "audit:analyze",
  "result": { "flags": [...], "meta": {...} }
}

// Job failed
{
  "type": "job:failed",
  "jobId": "abc123",
  "operation": "audit:analyze",
  "error": { "message": "...", "code": "..." }
}
```

### Operations & Status Steps

| Operation | Status Steps |
|-----------|-------------|
| `audit:extract` | `converting-pages` → `transcribing` (with page count) → `complete` |
| `audit:analyze` | `sanitizing` → `running-classifier` → `deep-audit` → `validating-output` → `complete` |
| `audit:fast-scan` | `scanning` → `complete` |
| `contract:start` | `parsing-gig` → `complete` |
| `contract:answer` | `computing-exposure` → `complete` |
| `contract:generate` | `assembling-contract` → `streaming` (with token chunks) → `complete` |
| `contract:report` | `generating-report` → `complete` |

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/ws/server.js` | WebSocket server setup, connection handling |
| `src/ws/jobManager.js` | Job lifecycle management, status emission |
| `src/ws/auth.js` | JWT verification for WebSocket connections |
| `src/constants/jobStatus.js` | Status constants for all operations |
| `src/services/contract.service.js` | Contract orchestration (graphWalker + assembly + persistence) |
| `src/controllers/contract.controller.js` | Contract HTTP handlers (job-based) |
| `src/routes/contract.routes.js` | Contract route definitions |
| `src/validators/contract.schema.js` | Zod schemas for contract endpoints |
| `Dockerfile` | Multi-stage Docker build |
| `.dockerignore` | Docker ignore rules |
| `railway.json` | Railway deployment config |

## Files to Modify

| File | Change |
|------|--------|
| `src/services/audit.service.js` | Fix model ID, add status emit callbacks |
| `src/services/vision.service.js` | Switch from AMD to Fireworks provider |
| `src/services/contractAssembly.service.js` | Fix `$defs`/`$ref` schema bug |
| `src/controllers/audit.controller.js` | Refactor to job-based (202 + WS) + save to DB |
| `src/routes/audit.routes.js` | Add `requireAuth` to all routes |
| `src/routes/index.js` | Mount contract routes |
| `index.js` | Expose HTTP server for WS attachment |
| `package.json` | Add `ws` dep, add `engines` |
| `.env` | Set `GEMMA_MODEL` |
| `.env.example` | Add missing vars |

## Files to Delete

| File | Reason |
|------|--------|
| `src/controllers/base.controller.js` | Empty, no purpose |
| `src/controllers/health.controller.js` | Empty, health is inline in `routes/index.js` |
| `src/routes/health.routes.js` | Empty, health is inline in `routes/index.js` |
