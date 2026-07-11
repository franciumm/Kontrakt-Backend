# Kontrakt Backend

Express.js backend for **Kontrakt (Clauseguard)** — an AI-powered contract tool
that helps freelancers generate bulletproof contracts and audit third-party
contracts for red flags. Two core flows:

1. **Contract Interrogator** — a clause-graph walker that drives a Q&A
   wizard, resolves clause dependencies, computes an exposure-coverage score,
   and assembles a flowing contract via LLM. *(Fully implemented end-to-end)*
2. **Contract Audit Engine** — an LLM-powered auditor that scans pasted or
   PDF-extracted contracts for dangerous clauses, defended by a five-layer
   prompt-injection security architecture. *(Fully implemented end-to-end)*

> **Note:** The core features including the WebSocket job system, auth enforcement across all routes, and deployment configurations are fully live.

---

## Key Features

### Contract Audit (Live)
- **Red-flag detection** across 10 categories: `work-for-hire-trap`,
  `unlimited-revisions`, `missing-kill-fee`, `vague-scope`, `ip-transfer-timing`,
  `asymmetric-indemnification`, `no-late-payment-penalty`, `overbroad-nda`,
  `auto-renewal`, `jurisdiction-mismatch`. Severity rated `red` / `yellow` / `green`.
- **Two-step flow**: PDF upload → Vision OCR extraction → user review → deep audit.
  The user-review step keeps the OCR layer from becoming an injection vector.
- **Fast-scan**: streaming first-pass trap count for instant feedback.
- **Five-layer injection defense** — see *Architecture* below.

### Contract Interrogator (Live)
- **Graph walker** (`src/lib/graphWalker.js`) — `getNextQuestions(state, gigType)`
  and `getExposureScore(state, gigType)`. Eligibility gates on `triggersWhen`
  AND dependency resolution; the score is the weighted coverage of triggered
  clauses (see `docs/DESIGN.md`).
- **Gig-specific clause libraries** for software and design gigs
  (`src/data/clauses/`), each with exposure weights on a 0–10 scale.
- **Contract assembly** (`src/services/contractAssembly.service.js`) — parses
  gig descriptions, streams contract generation, and produces exposure reports.

### Identity & Enforcement
- **Auth** — JWT access + refresh tokens, bcrypt-hashed passwords, hashed
  refresh-token storage with **reuse detection** (a replayed token revokes every
  session for the user). Tokens are returned in the JSON payload and passed via `Authorization: Bearer <token>`.
- **Enforced Auth** — Required across all Audit and Contract API endpoints.
- **Extract-token binding** — `/extract` mints a short-lived JWT binding the
  SHA-256 of the extracted text; `/analyze` rejects any text whose hash doesn't
  match.

### Operational Defenses
- **Rate limiting** — fixed-window per-IP (30 req/min default).
- **Concurrency cap** — per-process semaphore on `/extract` so concurrent PDF
  processing doesn't OOM the host.
- **Cluster mode** — opt-in (`CLUSTER=1`) for multi-core bounding.
- **WebSocket Job Pattern** — heavy operations are asynchronous.

---

## Tech Stack

- **Runtime**: Node.js 18+, ESM (`"type": "module"`).
- **Framework**: Express 5, Helmet, CORS allowlist, `cookie-parser`, `morgan`.
- **Validation**: Zod 3.
- **Database**: MongoDB via Mongoose 9 (`User`, `Contract`, `Audit` models).
- **LLM provider**: Fireworks AI via the `openai` SDK
  (`baseURL: https://api.fireworks.ai/inference/v1`). Models:
  - `glm-5p2` — deep audit
  - `accounts/francium/deployments/qi296nit` (Gemma 4 31B IT) — fast scan + vision OCR
- **Injection classifier**: Self-hosted on AMD Cloud (`llava-next-6b-instruct`)
  via OpenAI-compatible endpoint.
- **PDF processing**: Sent to Vision model as base64 images from frontend.
- **Auth**: `bcryptjs` + `jsonwebtoken`.
- **WebSocket**: `ws` package for real-time job status streaming.

---

## Architecture

### Audit Security — Five Layers

| Layer | Purpose | Location |
|-------|---------|----------|
| 1 — Sanitize | Regex strip of injection patterns, zero-width/bidi/invisible-char removal, length truncation | `src/lib/auditSanitize.js` |
| 2 — Harden prompt | Role-anchored system prompt + random per-call delimiters + sandwich defense | `src/lib/auditPrompt.js` |
| 3 — Validate output | JSON-schema check + length bounds + system-prompt leakage detection | `src/lib/auditValidation.js` |
| 4 — Latency budget | 5-minute `AbortController` → 503, with demo-cache fallback for `bad-client` preset | `src/services/audit.service.js` |
| 5 — Classify injection | Llava-next 6B gate with hardened, delimiter-wrapped prompt; **fail-closed** on timeout | `src/services/audit.service.js` |

The classifier runs **in parallel** with the deep audit on Layer-1-sanitized
text. If it fires `INJECTION_ATTEMPT` or times out, returned flags are
suppressed (`meta.flagsSuppressed = true`).

### Extract-Token Binding (SEC-108)

`/extract` returns an `extractToken` (JWT, 15 min) whose payload binds
`sha256(extractedText)`. `/analyze` requires it via the `X-Extract-Token`
header and rejects mismatched text with `403 EXTRACT_TOKEN_MISMATCH`.

### Threat Model

A STRIDE pass produced 20 findings; every one is either mitigated in code with
a passing PoC test, or carries a documented residual. See
`docs/security/REMEDIATION_REGISTER.md`.

---

## API Reference

All routes are mounted under `/api`. Errors share a common shape:
`{ success: false, error: { message, code?, details? } }`.

### Health
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{ status: "ok", service: "Kontrakt Backend API" }` (supports `?deep=1`) |

### Auth (`/api/auth`)
| Method | Path | Body / Auth | Response |
|--------|------|-------------|----------|
| POST | `/register` | `{ name, email, password }` | `201 { success, data: { userId, name, email, accessToken, refreshToken } }` |
| POST | `/login` | `{ email, password }` | `200 { success, data: { userId, name, email, accessToken, refreshToken } }` |
| POST | `/refresh` | `{ refreshToken }` | `200 { success, data: { accessToken, refreshToken } }` |
| POST | `/logout` | `{ refreshToken }` | `200 { success, data: null }` |
| GET | `/me` | `Authorization: Bearer <token>` | `200 { success, data: { _id, name, email, role } }` |

### Audit (`/api/audit`) - *Requires Auth*
| Method | Path | Body / Headers | Response |
|--------|------|----------------|----------|
| POST | `/extract` | `{ images: ["base64..."] }` | `202 { jobId }` → WS: `{ text, extractToken, pageCount, truncated }` |
| POST | `/analyze` | `{ contractText, preset? }` + `X-Extract-Token` header | `202 { jobId }` → WS: `{ flags[], meta }` |
| POST | `/fast-scan` | `{ contractText }` | `202 { jobId }` → WS: `{ "trapCount": N }` |
| GET | `/history` | — | `200 { success, data: audits[], pagination }` |
| GET | `/:id` | — | `200 { success, data: audit }` |

### Contract (`/api/contract`) - *Requires Auth*
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/start` | `{ gigDescription }` | `202 { jobId }` → WS: gigType, first questions, exposure score |
| POST | `/answer` | `{ contractId, answers }` | `202 { jobId }` → WS: next questions, exposure score |
| POST | `/generate` | `{ contractId }` | `202 { jobId }` → WS: streamed contract |
| POST | `/report` | `{ contractId }` | `202 { jobId }` → WS: exposure report |
| GET | `/presets` | — | `200 { presets[] }` |
| GET | `/history` | — | `200 { success, data: contracts[], pagination }` |
| GET | `/:id` | — | `200 { success, data: contract }` |

### Jobs (`/api/jobs`) - *Requires Auth*
| Method | Path | Response |
|--------|------|----------|
| GET | `/:id` | `200 { success, data: jobStatus }` |

> **Note:** Long-running endpoints use the asynchronous WebSocket Job Pattern. HTTP calls return `202 { jobId }`. Clients then subscribe to the WebSocket server to receive live status updates and the final result. The WebSocket connection requires an authentication token passed via `wss://<host>/ws?token=<accessToken>` or via a message `{ "type": "auth", "token": "..." }`. Then, clients send `{ "type": "subscribe", "jobId": "..." }`. If WS is unavailable, clients can poll `GET /api/jobs/:id`.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Fireworks AI API key
- MongoDB (local or Atlas)

### Install & Configure
```bash
git clone https://github.com/franciumm/Kontrakt-Backend.git
cd Kontrakt-Backend
npm install
cp .env.example .env       # fill in real values; never commit .env
```

### Environment Variables
| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `FIREWORKS_API_KEY` | yes | — | Get one at https://fireworks.ai/account/api-keys |
| `MONGO_URI` | yes | — | MongoDB connection string |
| `PORT` | no | `3000` | |
| `NODE_ENV` | no | `development` | Set `production` to enforce JWT secret requirement |
| `CORS_ORIGINS` | prod | localhost dev | Comma-separated origin allowlist |
| `JWT_ACCESS_SECRET` | prod | dev default | Strong random hex; required when `NODE_ENV=production` |
| `JWT_REFRESH_SECRET` | prod | dev default | Strong random hex; required when `NODE_ENV=production` |
| `JWT_EXTRACT_SECRET` | prod | dev default | Strong random hex; required when `NODE_ENV=production` |
| `JWT_ACCESS_TTL` | no | `15m` | |
| `JWT_REFRESH_TTL` | no | `7d` | |
| `JWT_SALT_ROUNDS` | no | `12` | bcrypt cost factor |
| `GEMMA_MODEL` | yes | `accounts/francium/deployments/qi296nit` | Fireworks deployment ID for fast-scan and Vision OCR |
| `AMD_CLASSIFIER_BASE_URL` | yes | — | Injection classifier endpoint on AMD Cloud |
| `CLASSIFIER_MODEL` | no | `llava-next-6b-instruct` | Model name on the classifier server |
| `CLUSTER` | no | off | Set `1` to enable multi-core cluster mode |

### Run
```bash
npm run dev          # nodemon
npm start            # node
CLUSTER=1 npm start  # multi-core
```

### Test
The suite uses Node's built-in test runner (no test framework dependency).
```bash
npm test                       # full suite
npm run test:unit              # unit only
npm run test:functional        # functional (mocked Fireworks)
npm run test:integration       # integration (real Express, ephemeral port)
npm run test:security          # security + STRIDE remediation PoCs
```

---

## Project Structure

```
├── index.js                 # Entry point (cluster mode, graceful shutdown)
├── VISION_PLAN.md           # Roadmap & execution plan
├── src/
│   ├── app.js               # Express app factory
│   ├── config/              # Env loading + frozen config object
│   ├── constants/           # Audit categories, HTTP status codes, job states
│   ├── controllers/         # HTTP handlers (audit, auth, contract, job)
│   ├── data/
│   │   ├── cache/           # Demo-cache fallbacks (bad-client, contract presets)
│   │   └── clauses/         # Gig-specific clause graphs (software, design)
│   ├── lib/                 # Domain logic (graphWalker, sanitize, prompt, validation)
│   ├── middleware/          # auth, rateLimiter, concurrency, validateRequest
│   ├── providers/           # Fireworks + AMD OpenAI SDK clients
│   ├── routes/              # Express routers (audit, auth, contract, job)
│   ├── services/            # Business logic (audit, vision, auth, contract, assembly)
│   ├── utils/               # Logger, AppError, utility re-exports
│   ├── validators/          # Zod request schemas
│   └── ws/                  # WebSocket server, job manager, ws auth
├── DB/
│   ├── DB.Connect.js        # Mongoose connection
│   └── models/              # User, Contract, Audit schemas
├── tests/                   # unit / functional / integration / security
└── docs/                    # PRD, DESIGN, CEO_BUILD_PLAN, SECURITY, AMD setup
```

---

## Security Notes

- **Rotate any leaked keys immediately.** If a real key was ever committed,
  purge it from history (`git filter-repo` / BFG) and rotate at the provider.
- Production should source secrets from a secrets manager rather than a flat
  `.env`, and add a logger redaction filter for any field matching
  `/key|secret|password|token|auth/i`.
- See `docs/security/REMEDIATION_REGISTER.md` for the full STRIDE threat model
  and remediation status.

---

## License

ISC.
