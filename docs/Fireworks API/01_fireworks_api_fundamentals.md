# Fireworks AI — API Fundamentals

> Source: Fireworks AI developer documentation. Full doc index: https://docs.fireworks.ai/llms.txt
> Code samples in this file use **JavaScript** (Node) and the **Anthropic-compatible** endpoint where applicable.

This file covers the basics you need before calling any Fireworks endpoint: what the API is, how to authenticate, account-level quota management, and how to build reliable clients (timeouts, retries, rate-limit handling).

---

## 1. Introduction

The Fireworks AI REST API lets you interact with language, image, and embedding models using an API key. Beyond inference, it also lets you automate management of **models, deployments, datasets,** and more.

It exposes two compatible surfaces you can point standard SDKs at:

- **OpenAI-compatible**: `https://api.fireworks.ai/inference/v1` — use the `openai` npm package
- **Anthropic-compatible**: `https://api.fireworks.ai/inference` — use the `@anthropic-ai/sdk` npm package

## 2. Authentication

Every request to the Fireworks REST API must include:

```
authorization: Bearer <API_KEY>
content-type: application/json
```

### Getting an API key

You can obtain a key in two ways:

1. Run `firectl api-key create`
2. Generate one through the [Fireworks AI dashboard](https://app.fireworks.ai/settings/users/api-keys) → **Create API key**

Store the key securely. On macOS/Linux, export it as an environment variable:

```bash
export FIREWORKS_API_KEY="your_api_key_here"
```

On Windows:

```powershell
setx FIREWORKS_API_KEY "your_api_key_here"
```

## 3. Account Management APIs

In addition to inference and deployment endpoints, Fireworks exposes account-scoped **quota** endpoints:

- **List Quotas**
- **Get Quota**
- **Update Quota**

These let you inspect and (where permitted) adjust the resource limits tied to your account.

---

## 4. Reliability and Error Handling

Production applications need to handle network variability, transient server errors, and long-running requests gracefully. This section covers the recommended patterns for JavaScript clients (the same principles apply whether you're calling the OpenAI-compatible or Anthropic-compatible surface).

### 4.1 Timeout configuration

Set client timeouts based on workload type:

| Workload                             | Recommended client timeout     |
| ------------------------------------ | ------------------------------- |
| Interactive / chat                   | 30–60 seconds                   |
| Agentic (tool calls, multi-step)     | 5–30 minutes                    |
| Large model inference (long context) | 10–30 minutes                   |
| Batch job submission                 | 60 seconds (results are async)  |

**OpenAI-compatible Node client:**

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.fireworks.ai/inference/v1",
  apiKey: process.env.FIREWORKS_API_KEY,
  timeout: 30 * 60 * 1000, // 30 min, in ms — for agentic / long-context workloads
});
```

**Anthropic-compatible Node client:**

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "https://api.fireworks.ai/inference",
  apiKey: process.env.FIREWORKS_API_KEY,
  timeout: 30 * 60 * 1000, // 30 min, in ms
});
```

**Raw `fetch` with an explicit timeout (`AbortController`):**

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 min

try {
  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "...", messages: [/* ... */] }),
    signal: controller.signal,
  });
  const data = await response.json();
} finally {
  clearTimeout(timeoutId);
}
```

### 4.2 Retry logic

**Which errors are retryable:**

| Status | Meaning               | Retry?                            |
| ------ | --------------------- | ---------------------------------- |
| `429`  | Rate limit            | ✅ Yes — with backoff               |
| `500`  | Internal server error | ✅ Yes — transient                  |
| `502`  | Bad gateway           | ✅ Yes — transient                  |
| `503`  | Service unavailable   | ✅ Yes — with backoff               |
| `504`  | Gateway timeout       | ✅ Yes — transient                  |
| `400`  | Bad request           | ❌ No — fix the request             |
| `401`  | Unauthorized          | ❌ No — check API key               |
| `404`  | Not found             | ❌ No — check model/deployment ID   |
| `422`  | Unprocessable entity  | ❌ No — fix the request body        |

**Exponential backoff with jitter:**

```javascript
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function callWithRetry(requestFn, { maxRetries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (err) {
      const status = err.status ?? err.response?.status;
      const isLastAttempt = attempt === maxRetries - 1;

      if (!RETRYABLE_STATUSES.has(status) || isLastAttempt) {
        throw err;
      }

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Usage:
const response = await callWithRetry(() =>
  client.chat.completions.create({
    model: "accounts/fireworks/models/gpt-oss-120b",
    messages: [{ role: "user", content: "Hello!" }],
  })
);
```

**Built-in retry via the client's `maxRetries` option** (simplest option — works on both SDKs):

```javascript
// OpenAI-compatible
const client = new OpenAI({
  baseURL: "https://api.fireworks.ai/inference/v1",
  apiKey: process.env.FIREWORKS_API_KEY,
  maxRetries: 3,
});

// Anthropic-compatible
const anthropicClient = new Anthropic({
  baseURL: "https://api.fireworks.ai/inference",
  apiKey: process.env.FIREWORKS_API_KEY,
  maxRetries: 3,
});
```

### 4.3 Handling 429 rate limits

- **On serverless:** Limits scale automatically with sustained usage. For immediate extra capacity, contact support or switch to a dedicated (on-demand) deployment.
- **On dedicated deployments:** Increase concurrency by raising replica counts (e.g., via `firectl deployment update`) and tuning autoscaling settings. See the Deployments guide's Autoscaling section.

### 4.4 Long-running training jobs

For RL / RFT trainer jobs, use `reconnect_and_wait` on the job manager to recover from preemption or transient failures.

To preserve optimizer state across interruptions, set `dcp_save_interval` in your training config (see the RFT parameters reference).

### 4.5 Analytics dashboard vs. client-side failures

The Fireworks analytics/usage dashboard counts **server-acknowledged** requests only. It does **not** capture connection errors that occur before a request reaches the server — those show up as failures client-side but may appear as zero or reduced traffic in the console.

**Rule of thumb:** if your client shows failures but the dashboard looks clean, the problem is likely client-side — a timeout before connection, DNS resolution failure, or a network path issue.

For dedicated deployments, use the metrics-export feature to get per-deployment Prometheus metrics reflecting what Fireworks infrastructure actually observed.