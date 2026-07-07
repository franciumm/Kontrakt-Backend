# Kontrakt Backend

Express.js backend for **Kontrakt** — a tool that helps freelancers generate
bulletproof contracts and audit third-party contracts for red flags. Two
engines run on the same API:

1. **Contract Interrogator** — a graph-based clause walker that drives a Q&A,
   resolves clause dependencies, and computes an exposure-coverage score that
   reflects how well protected the freelancer is. (Domain logic complete; not
   yet mounted on an HTTP route.)
2. **Contract Audit Engine** — an LLM-powered auditor that scans pasted or
   PDF-extracted contracts for dangerous clauses, defended against prompt
   injection by a five-layer security architecture.

---

## Key features

### Contract Interrogator
- **Graph walker** (`src/lib/graphWalker.js`) — `getNextQuestions(state, gigType)`
  and `getExposureScore(state, gigType)`. Eligibility gates on `triggersWhen`
  AND dependency resolution; the score is the weighted coverage of triggered
  clauses (see `docs/DESIGN.md`).
- **Gig-specific clause libraries** for software and design gigs
  (`src/data/clauses/`), each with exposure weights on a 0–10 scale.

### Contract Audit
- **Red-flag detection** across 10 categories: `work-for-hire-trap`,
  `unlimited-revisions`, `missing-kill-fee`, `vague-scope`, `ip-transfer-timing`,
  `asymmetric-indemnification`, `no-late-payment-penalty`, `overbroad-nda`,
  `auto-renewal`, `jurisdiction-mismatch`. Severity rated `red` / `yellow` / `green`.
- **Two-step flow**: PDF → Vision OCR → user review → deep audit. The user-review
  step keeps the OCR layer from becoming an injection vector.
- **Five-layer injection defense** — see *Architecture* below.

### Identity & enforcement
- **Auth** — JWT access + refresh tokens, bcrypt-hashed passwords, hashed
  refresh-token storage with **reuse detection** (a replayed token revokes every
  session for the user). Cookies are `httpOnly`, `SameSite=strict`, `Secure` in
  production.
- **Extract-token binding** — `/extract` mints a short-lived JWT binding the
  SHA-256 of the extracted text; `/analyze` rejects any text whose hash doesn't
  match. Prevents "extract a clean contract, then submit a different one to
  fake a clean audit."

### Operational defenses
- **Rate limiting** — fixed-window per-IP (30 req/min default).
- **Concurrency cap** — per-process semaphore on `/extract` so a flood of
  distinct IPs can't OOM the host via concurrent PDF rendering.
- **Cluster mode** — opt-in (`CLUSTER=1`) for multi-core bounding.

---

## Tech stack

- **Runtime**: Node.js 18+, ESM (`"type": "module"`).
- **Framework**: Express 5, Helmet, CORS allowlist, `cookie-parser`, `morgan`.
- **Validation**: Zod 3.
- **Database**: MongoDB via Mongoose 9 (`User`, `Contract`, `Audit` models).
- **LLM provider**: Fireworks AI via the `openai` SDK
  (`baseURL: https://api.fireworks.ai/inference/v1`). Hardcoded model IDs per
  service: `glm-5p2` (deep audit), `gemma-4-26b-a4b-it` (fast scan),
  `llama-v3p2-90b-vision-instruct` (OCR), `llama-guard-3-8b` (injection classifier).
- **PDF rendering**: `pdfjs-dist` + `@napi-rs/canvas` — pure-JS, no ghostscript
  subprocess. `pdf-lib` for validation and structure checks.
- **Auth**: `bcryptjs` + `jsonwebtoken`.
- **File uploads**: `multer` (in-memory, 2 MB cap, PDF-only with magic-byte check).

---

## Architecture

### Audit security — five layers

| Layer | Purpose | Location |
|-------|---------|----------|
| 1 — Sanitize | Regex strip of injection patterns (English + multilingual: DE/FR/ES/PT/IT/ZH/JA), zero-width / bidi / invisible-char removal, length truncation | `src/lib/auditSanitize.js` |
| 2 — Harden prompt | Role-anchored system prompt + random per-call delimiters + sandwich defense | `src/lib/auditPrompt.js` |
| 3 — Validate output | JSON-schema check + length bounds + system-prompt leakage detection | `src/lib/auditValidation.js` |
| 4 — Latency budget | 5-minute `AbortController` → 503, with demo-cache fallback for the `bad-client` preset | `src/services/audit.service.js` |
| 5 — Classify injection | Llama Guard 3 8B gate with a hardened, delimiter-wrapped prompt; **fail-closed** on timeout (flags suppressed) | `src/services/audit.service.js` |

The classifier runs **in parallel** with the deep audit on Layer-1-sanitized
text. If it fires `INJECTION_ATTEMPT` or times out, returned flags are
suppressed (`meta.flagsSuppressed = true`) — defense-in-depth against coercion.

### Extract-token binding (SEC-108)

`/extract` returns an `extractToken` (JWT, 15 min) whose payload binds
`sha256(extractedText)`. `/analyze` requires it via the `X-Extract-Token`
header and rejects mismatched text with `403 EXTRACT_TOKEN_MISMATCH`. Body
validation runs **before** the token gate, so missing/oversize bodies still
return `400`.

### Threat model

A STRIDE pass produced 20 findings; every one is either mitigated in code with
a passing PoC test, or carries a documented residual. See
`docs/security/REMEDIATION_REGISTER.md`. The PoC/verification tests live in
`tests/security/`.

---

## API reference

All routes are mounted under `/api`. Errors share a common shape:
`{ success: false, error: { message, code?, details? } }`.

### Health
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{ status: "ok", service: "Kontrakt Backend API" }` |

### Auth (`/api/auth`)
| Method | Path | Body / Auth | Response |
|--------|------|-------------|----------|
| POST | `/register` | `{ name, email, password }` | `201 { userId, name, email }` + cookies |
| POST | `/login` | `{ email, password }` | `200 { userId, name, email }` + cookies |
| POST | `/refresh` | `refreshToken` cookie | `200` + rotated cookies |
| POST | `/logout` | `accessToken` cookie | `200`, cookies cleared |
| GET | `/me` | `accessToken` cookie | `200 { _id, name, email, role }` |

### Audit (`/api/audit`)
| Method | Path | Body / Headers | Response |
|--------|------|----------------|----------|
| POST | `/extract` | `multipart/form-data`, field `contractFile` (PDF, ≤2 MB, ≤10 pages) | `200 { text, extractToken, pageCount, truncated }` |
| POST | `/analyze` | `{ contractText, preset? }` + `X-Extract-Token` header | `200 { flags[], meta }` |
| POST | `/fast-scan` | `{ contractText }` | streamed NDJSON `{ "trapCount": N }` |

`/analyze` `meta` includes `source` (`live` | `cache`), `truncated`,
`injectionAttempt`, `layer5TimedOut`, `classifierHealthy`, `flagsSuppressed`,
and `cacheFallback` when the demo cache was used.

---

## Getting started

### Prerequisites
- Node.js 18+
- A Fireworks AI API key
- MongoDB (local or Atlas) if using auth

### Install & configure
```bash
git clone https://github.com/franciumm/Kontrakt-Backend.git
cd Kontrakt-Backend
npm install
cp .env.example .env       # fill in real values; never commit .env
```

### Environment variables
| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `FIREWORKS_API_KEY` | yes | — | Get one at https://fireworks.ai/account/api-keys |
| `MONGO_URI` | for auth | — | MongoDB connection string |
| `PORT` | no | `3000` | |
| `NODE_ENV` | no | `development` | Set `production` to enforce JWT secret requirement |
| `CORS_ORIGINS` | no | localhost dev | Comma-separated origin allowlist |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_EXTRACT_SECRET` | prod | dev default | Strong random hex; required when `NODE_ENV=production` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` / `JWT_EXTRACT_TTL` | no | `15m` / `7d` / `15m` | |
| `JWT_SALT_ROUNDS` | no | `12` | bcrypt cost factor |
| `FIREWORKS_MODEL` | no | `kimi-k2-instruct-0905` | Per-service code hardcodes model IDs and ignores this |
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
Current status: **151 tests, 151 pass, 0 skip, 0 fail.**

---

## Project structure

```
src/
├── config/              # env loading + frozen config object
├── constants/           # audit categories, HTTP status codes
├── controllers/         # audit + auth HTTP handlers
├── data/
│   ├── cache/           # demo-cache fallbacks (bad-client, contract presets)
│   └── clauses/         # gig-specific clause graphs (software, design)
├── lib/                 # canonical domain logic (graphWalker, sanitize, prompt, validation)
├── middleware/          # auth, rateLimiter, concurrency, upload, validateRequest, errorHandler
├── providers/           # Fireworks (OpenAI SDK with Fireworks baseURL)
├── routes/              # audit + auth routers
├── services/            # audit, pdf, vision, auth, auth.store, extractToken, contractAssembly
├── utils/               # logger, AppError, audit sanitize/validation re-exports
└── validators/          # Zod request schemas
DB/models/               # Mongoose models (User, Contract, Audit)
tests/                   # unit / functional / integration / security
docs/                    # PRD, DESIGN, CEO_BUILD_PLAN, SECURITY, threat-model register
```

---

## Security notes

- **Rotate any leaked keys immediately.** The committed `.env.example` uses a
  placeholder; if a real key was ever committed, purge it from history
  (`git filter-repo` / BFG) and rotate at the provider.
- Production should source secrets from a secrets manager rather than a flat
  `.env`, and add a logger redaction filter for any field matching
  `/key|secret|password|token|auth/i`.
- `/fast-scan` is intentionally not gated by the extract token; only `/analyze`
  is. Gating fast-scan is a one-line follow-up if required.

---

## License

ISC.
