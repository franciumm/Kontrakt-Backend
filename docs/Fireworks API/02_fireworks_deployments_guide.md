# Fireworks AI — Deployments (On-Demand / Dedicated GPUs)

> Source: Fireworks AI developer documentation. Full doc index: https://docs.fireworks.ai/llms.txt
> Code samples in this file use **JavaScript** (Node) and the **Anthropic-compatible** endpoint where applicable.

On-demand deployments give you dedicated GPUs: no rate limits, faster autoscaling, more consistent latency, and access to models not available on serverless. This file covers the quickstart plus the full deployment configuration/management reference.

---

## 1. Why on-demand deployments

Advantages over serverless:

- **Better performance** — lower latency, higher throughput, predictable performance unaffected by other users
- **No hard rate limits** — limited only by your deployment's own capacity
- **Cost-effective at scale** — billed by GPU-second (vs. serverless per-token billing), cheaper under high utilization
- **Broader model selection** — access to models not offered on serverless
- **Custom models** — bring your own model (supported architectures) from Hugging Face or elsewhere

Need higher GPU quotas or reserved capacity? Contact Fireworks support.

---

## 2. Quickstart: your first deployment

### Step 1 — Create and export an API key

Create a key in the [dashboard](https://app.fireworks.ai/settings/users/api-keys), then export it:

```bash
# macOS/Linux
export FIREWORKS_API_KEY="your_api_key_here"
```
```powershell
# Windows
setx FIREWORKS_API_KEY "your_api_key_here"
```

### Step 2 — Install the `firectl` CLI

```bash
# Homebrew
brew tap fw-ai/firectl
brew install firectl
# if SHA256 check fails: brew update, then retry

# macOS (Apple Silicon)
curl https://storage.googleapis.com/fireworks-public/firectl/stable/darwin-arm64.gz -o firectl.gz
gzip -d firectl.gz && chmod a+x firectl
sudo mv firectl /usr/local/bin/firectl
sudo chown root: /usr/local/bin/firectl

# macOS (x86_64)
curl https://storage.googleapis.com/fireworks-public/firectl/stable/darwin-amd64.gz -o firectl.gz
gzip -d firectl.gz && chmod a+x firectl
sudo mv firectl /usr/local/bin/firectl
sudo chown root: /usr/local/bin/firectl

# Linux (x86_64)
wget -O firectl.gz https://storage.googleapis.com/fireworks-public/firectl/stable/linux-amd64.gz
gunzip firectl.gz
sudo install -o root -g root -m 0755 firectl /usr/local/bin/firectl

# Windows (64-bit)
wget -L https://storage.googleapis.com/fireworks-public/firectl/stable/firectl.exe
```

Then sign in:

```bash
firectl signin
```

### Step 3 — Create a deployment

```bash
firectl deployment create accounts/fireworks/models/gpt-oss-120b \
        --deployment-shape fast \
        --scale-down-window 5m \
        --scale-up-window 30s \
        --min-replica-count 0 \
        --max-replica-count 1 \
        --scale-to-zero-window 5m \
        --wait
```

`--deployment-shape` accepts:

- `fast` — low latency, optimized for interactive workloads (pre-configured hardware defaults)
- `throughput` — trades latency for lower cost-per-token at scale
- `cost` — trades latency/throughput for lowest cost-per-token at small scale (good for early experimentation)

You can skip shapes and pass your own hardware configuration instead — see §5 below.

Example response:

```
Name: accounts/<YOUR ACCOUNT ID>/deployments/<DEPLOYMENT ID>
Create Time: <CREATION_TIME>
Expire Time: <EXPIRATION_TIME>
Created By: <YOUR EMAIL>
State: CREATING
Status: OK
Min Replica Count: 0
Max Replica Count: 1
Desired Replica Count: 0
Replica Count: 0
Autoscaling Policy:
  Scale Up Window: 30s
  Scale Down Window: 5m0s
  Scale To Zero Window: 5m0s
Base Model: accounts/fireworks/models/gpt-oss-120b
...other fields...
```

Save the `Name:` field — you'll need it to query the deployment.

### Step 4 — Query your deployment

Replace `<DEPLOYMENT_NAME>` with the `Name:` value from Step 3.

**JavaScript — OpenAI-compatible client:**

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const response = await client.chat.completions.create({
  model: "<DEPLOYMENT_NAME>",
  messages: [{ role: "user", content: "Explain quantum computing in simple terms" }],
});

console.log(response.choices[0].message.content);
```

You can also target a base model on a specific deployment with the `#<DEPLOYMENT_NAME>` suffix, e.g. `accounts/fireworks/models/gpt-oss-120b#<DEPLOYMENT_NAME>`.

**JavaScript — Anthropic-compatible client:**

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference",
});

const response = await client.messages.create({
  model: "<DEPLOYMENT_NAME>",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Explain quantum computing in simple terms" }],
});

console.log(response.content[0].text);
```

**curl:**

```bash
curl https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIREWORKS_API_KEY" \
  -d '{
    "model": "<DEPLOYMENT_NAME>",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ]
  }'
```

> Note: the full path form is `accounts/<ACCOUNT_ID>/deployments/<DEPLOYMENT_ID>` (e.g. `accounts/alice/deployments/12345678`), used directly as the `model` value with either client.

### Common autoscaling recipes

**Autoscale on requests per second:**

```bash
firectl deployment create accounts/fireworks/models/gpt-oss-120b \
        --deployment-shape fast \
        --scale-down-window 5m \
        --scale-up-window 30s \
        --scale-to-zero-window 5m \
        --min-replica-count 0 \
        --max-replica-count 4 \
        --load-targets requests_per_second=5 \
        --wait
```

**Autoscale on concurrent requests:**

```bash
firectl deployment create accounts/fireworks/models/gpt-oss-120b \
        --deployment-shape fast \
        --scale-down-window 5m \
        --scale-up-window 30s \
        --scale-to-zero-window 5m \
        --min-replica-count 0 \
        --max-replica-count 4 \
        --load-targets concurrent_requests=5 \
        --wait
```

---

## 3. Region / placement

If you don't specify `--region`, the deployment is **pinned to a single datacenter** at creation time and will **not** be migrated automatically later.

For production workloads needing geographic availability or capacity failover, always set `--region` explicitly:

```bash
firectl deployment create accounts/fireworks/models/<MODEL_NAME> --region GLOBAL   # recommended default
firectl deployment create accounts/fireworks/models/<MODEL_NAME> --region US
firectl deployment create accounts/fireworks/models/<MODEL_NAME> --region EUROPE
firectl deployment create accounts/fireworks/models/<MODEL_NAME> --region APAC
```

**Check current placement:**

```bash
firectl deployment get <DEPLOYMENT_ID>
```

The deployment metadata shows where replicas are currently allowed to schedule (placement/region configuration).

**Change placement:** There is no supported in-place command to change region. You must recreate:

```bash
# 1. Create replacement with correct region
firectl deployment create accounts/fireworks/models/<MODEL_NAME> \
  --deployment-shape <shape> \
  --region GLOBAL \
  --min-replica-count 1

# 2. Verify the new deployment is healthy, then point your app at the new endpoint

# 3. Delete the old deployment
firectl deployment delete <OLD_DEPLOYMENT_ID>
```

See the Regions reference for mega-regions and hardware availability by region.

---

## 4. Deployment status states

Backend `Deployment.State` values:

| State      | Meaning                          |
| ---------- | --------------------------------- |
| CREATING   | Still being created                |
| READY      | Ready to be used                   |
| UPDATING   | In-progress updates happening      |
| DELETING   | Being deleted                      |
| DELETED    | Soft-deleted                       |
| FAILED     | Creation failed (see status detail)|

**UI-only display labels** (derived from deployment fields, not separate backend enum values):

- **Inactive** — `state == READY && max_replica_count == 0 && ready_replica_count == 0`
- **Scaled to 0** — `state == READY && min_replica_count == 0 && max_replica_count > 0 && desired_replica_count == 0 && ready_replica_count == 0`

---

## 5. Deployment shapes

Deployment shapes are pre-configured templates (hardware, quantization, other perf factors) optimized for a goal:

- **Fast** — low latency, for interactive workloads
- **Throughput** — cost-per-token at scale, high-volume workloads
- **Minimal** — lowest cost, for testing/light workloads

```bash
# List available shapes for a base model
firectl deployment-shape-version list --base-model <model-id>

# Create with a shape (shorthand)
firectl deployment create accounts/fireworks/models/deepseek-v3 --deployment-shape throughput

# Create with the full shape ID
firectl deployment create accounts/fireworks/models/llama-v3p3-70b-instruct \
  --deployment-shape accounts/fireworks/deploymentShapes/llama-v3p3-70b-instruct-fast

# View shape details
firectl deployment-shape-version get <full-deployment-shape-version-id>
```

---

## 6. Managing & configuring deployments

### Basic management

```bash
firectl deployment list                 # list all deployments
firectl deployment get <DEPLOYMENT_ID>   # check status
firectl deployment delete <DEPLOYMENT_ID> # delete
```

### GPU hardware

Choose accelerator type with `--accelerator-type`:

- `NVIDIA_A100_80GB`
- `NVIDIA_H100_80GB`
- `NVIDIA_H200_141GB`

GPU availability varies by region — see the Hardware Selection Guide.

### Autoscaling

Controls replica counts, scale timing, and load targets (see §2 recipes above for examples). Full parameter reference: Autoscaling guide.

### Multiple GPUs per replica

```bash
firectl deployment create <MODEL_NAME> --accelerator-count 2
```

More GPUs = faster generation, but scaling is **sub-linear** (2x GPUs ≠ 2x performance).

### Advanced topics

- **Speculative decoding** — speed up generation using draft models or n-gram speculation
- **Quantization** — reduce precision (e.g. FP16 → FP8) for 30–50% speed/cost improvement
- **Performance benchmarking** — load-test and tune your deployment
- **Managing default deployments** — control which deployment serves queries that reference just the model name (no deployment suffix)
- **Publishing deployments** — make your deployment accessible to other Fireworks users

---

## 7. Next steps

From here, natural next topics are:

- **Tool Calling** — connect models to external tools/APIs (see `04_fireworks_agentic_workflows.md`)
- **Batch Inference** — run async jobs at scale, cheaper (see `05_fireworks_batch_and_responses_api.md`)
- **Uploading custom models**, **Fine-tuning**, and the full **API Reference** (not covered in the source material collected here)