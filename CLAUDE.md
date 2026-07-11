# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # nodemon
npm start       # node index.js
npm test        # runs the test suite using the node native test runner
```

## Environment

- Required: `FIREWORKS_API_KEY` — `src/config/index.js` calls `requireEnv()` at module load, so importing config throws synchronously if it is missing.
- Optional: `FIREWORKS_MODEL` (defaults to `kimi-k2-instruct-0905`, but **code hardcodes model IDs per service** and ignores this var), `MONGO_URI`, `PORT`, `NODE_ENV`.
- Copy `.env.example` → `.env`.

## Tech stack

- **ESM-only** (`"type": "module"`). Every relative import must include the `.js` extension.
- Express 5, Mongoose 9, Zod 3, multer 2, pdf-lib, pdf2pic.
- **LLM provider is Fireworks AI** accessed through the `openai` SDK by overriding `baseURL` to `https://api.fireworks.ai/inference/v1` (`src/providers/fireworks.provider.js`). The singleton client is imported wherever LLM calls are made.
- MongoDB models live in `DB/models/` — **outside `src/`**. Mongoose schemas for `User`, `Contract` (gigType: software | design | marketing | other), `Audit` (flags use the same shape as the audit service output).

## Two product flows

### Flow 1 — Contract Interrogator
Graph-based Q&A that walks clause nodes by dependency resolution and computes an exposure-coverage score.

- `src/lib/graphWalker.js` — pure domain logic: `getNextQuestions(state, gigType)`, `getExposureScore(state, gigType)`.
- `src/data/clauses/{software,design}.clauses.js` — clause graphs. Each node: `{ id, gigTypes, title, body, plainEnglish, exposureWeight, triggersWhen(state), dependsOn: [id...], questions: [{ field, inputType, ... }] }`. A clause is eligible when `triggersWhen` is true AND all `dependsOn` clauses have every question answered.
- `src/services/contractAssembly.service.js` — `parseGigDescription`, `generateContractStream` (streaming), `generateExposureReport`.
- `src/services/contract.service.js` — Core functions wrapping the interrogator (`startContract`, `answerQuestions`, `generateContract`, `generateReport`).
- **Fully wired to HTTP** — `contract.routes.js` exposes POST endpoints for each step, integrating closely with `jobManager.js` to dispatch WS updates.

### Flow 2 — Contract Audit (wired end-to-end)
PDF/text → red-flag detection. Routes mounted at `/api/audit`:

- `POST /api/audit/extract` — multer upload (PDF only, 5 MB cap, in-memory) → `pdf.service.convertPdfToImages` → `vision.service.transcribeImages` (LLaMA 3.2 90B Vision). Returns extracted text for user review.
- `POST /api/audit/analyze` — accepts `contractText` body, runs `deepAuditContract`.
- `POST /api/audit/fast-scan` — streams trap-count JSON from Gemma.

Two-step design (extract → user approves → analyze) is deliberate: Vision OCR defeats image-based text traps that copy-paste would miss, and the user-confirmation step prevents the OCR layer from becoming an injection vector.

## Audit security architecture (5 layers)

The audit flow defends against prompt injection with five layers. **Layers 1, 2, and 3 each have two parallel implementations** — one in `src/lib/` (the documented canonical version) and one in `src/utils/*.util.js` (the version `audit.service.js` actually imports). When editing, change both or pick one and update the import. Current state:

| Layer | Purpose | Implemented in | Wired? |
|-------|---------|----------------|--------|
| 1 — Sanitize | Strip injection patterns, truncate, remove zero-width chars | `src/lib/auditSanitize.js` | yes |
| 2 — Harden prompt | Role-anchored system prompt + random per-call delimiters + sandwich defense | `src/lib/auditPrompt.js` | yes |
| 3 — Validate output | JSON-schema check + length bounds + system-prompt leakage detection | `src/lib/auditValidation.js` | yes |
| 4 — Latency budget | 8s `AbortController` timeout → maps to HTTP 503 | `audit.service.js` | yes (timeout fires; throws 503, no cache fallback) |
| 5 — Classify injection | Llama Guard 3 8B SAFE/INJECTION_ATTEMPT gate, runs in parallel with deep audit; suppresses flags on INJECTION_ATTEMPT | `classifyInjectionAttempt` in `audit.service.js` | yes (parallel; 1.5s own budget; runs on Layer-1-sanitized text) |

`src/utils/auditSanitize.util.js` and `src/utils/auditValidation.util.js` are now thin re-exports of the canonical `src/lib/` implementations for backwards compatibility. Edit `src/lib/` directly; the utils files only forward.

**Demo cache fallback** (`src/data/cache/audit.cache.js`, `contract.cache.js`) holds scripted responses for the "bad client contract" / "logo design" presets referenced in `docs/CEO_BUILD_PLAN.md`. They are imported nowhere — the 8s timeout throws 503 rather than falling back. Wire explicitly only if you want demo-scripted behavior.

If you add new system-prompt strings to the audit flow, add a corresponding `LEAKAGE_PATTERNS` entry to `src/lib/auditValidation.js` so leakage is detected.

## LLM call patterns (Fireworks)

- **Hardcoded model IDs per service** — see `MODELS` constants at the top of each service. The `FIREWORKS_MODEL` env var is not consulted by any service.
- **Structured output** is enforced via `response_format: { type: "json_schema", json_schema: { name, schema } }`. Schemas use the `$defs` + `$ref` pattern (see `DEEP_AUDIT_SCHEMA`, `FAST_SCAN_SCHEMA`, `GIG_INTENT_SCHEMA`). When changing allowed enum values (e.g. audit categories), update **all four** locations: the schema in `audit.service.js`, `src/constants/auditCategories.js`, the Mongoose enum in `DB/models/Audit.Model.js`, and both output validators.
- **Streaming** uses `stream: true` + `for await (const chunk of stream)` over `chunk.choices[0]?.delta?.content`.
- Provider is constructed with `maxRetries: 3` and a 30-minute timeout (long-context audits).
- Most calls pass `safe_tokenization: true`.

## System dependencies for PDF flow

`pdf2pic` shells out to **ghostscript** and **graphicsmagick** on the host — both must be installed (`brew install ghostscript graphicsmagick` on macOS) or `convertPdfToImages` will throw. PDFs are capped at 10 pages (`MAX_PAGES` in `pdf.service.js`) and 5 MB (`upload.js`).

## Request lifecycle

`src/routes/index.js` mounts `/audit` and `/health`. `errorHandler.js` formats Zod errors as 400 with field details and attaches `stack` only outside production. `asyncHandler.js` is the standard Promise-catch wrapper. Several middleware files (`validateRequest.js`) are currently 0 bytes.

## Commit style

Conventional Commits — `feat(api):`, `feat(api): define JSON schemas via defs/ref` — see `git log` for established prefixes.
