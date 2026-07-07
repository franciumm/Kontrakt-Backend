# Fireworks AI — Batch API & Responses API

> Source: Fireworks AI developer documentation. Full doc index: https://docs.fireworks.ai/llms.txt

This file covers two async/stateful workflows: the **Batch API** for large-scale offline processing, and the **Responses API** for stateful, tool-integrated conversations.

---

## 1. Batch API

Process large volumes of requests asynchronously at **50% off** serverless per-token prices. Ideal for:

- Data labeling and synthetic data generation
- Distilling smaller models from larger ones
- Large-scale evaluations and benchmarking
- Document processing and similar bulk workloads

### 1.1 Model compatibility

Not all models support the Batch API — verify before submitting a job:

- **Base Models** — any model that supports On-Demand Deployments in the Model Library
- **Custom Models** — your uploaded/fine-tuned models built on a batch-compatible base model

> Newly added models may have a delay before Batch support lands. See the Quantization page for precision info.

### 1.2 Troubleshooting a batch job that isn't running

1. **Validation failed** → check your JSONL input; each line must be a complete, valid JSON object matching the request schema.
2. **Stuck in "pending"** → jobs wait to be scheduled during the selected time window; this is expected and doesn't mean it's stuck.
3. **Stuck "creating" a deployment for 30+ minutes** → contact support with your job ID. Before doing so, confirm (a) the model supports batch inference and (b) your account has sufficient batch quota.
4. **Progress paused** → likely waiting on capacity; the job resumes automatically.

### 1.3 Requirements

- **File format:** JSONL (each line a valid JSON object)
- **Size limit:** under 1GB
- **Required fields:** `custom_id` (unique per line) and `body` (the request parameters)

**Example dataset** (`batch_input_data.jsonl`):

```json
{"custom_id": "request-1", "body": {"messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "What is the capital of France?"}], "max_tokens": 100}}
{"custom_id": "request-2", "body": {"messages": [{"role": "user", "content": "Explain quantum computing"}], "temperature": 0.7}}
{"custom_id": "request-3", "body": {"messages": [{"role": "user", "content": "Tell me a joke"}]}}
```

### 1.4 Creating the input dataset

**firectl:**

```bash
firectl dataset create batch-input-dataset ./batch_input_data.jsonl
```

**HTTP API** (two calls: create the dataset entry, then upload the file):

```bash
# Create Dataset Entry
curl -X POST "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/datasets" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"datasetId": "batch-input-dataset", "dataset": {"userUploaded": {}}}'

# Upload JSONL file
curl -X POST "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/datasets/batch-input-dataset:upload" \
  -H "Authorization: Bearer ${API_KEY}" \
  -F "file=@./batch_input_data.jsonl"
```

(Dashboard flow: pick a model → select dataset → configure optional settings — same steps, done via UI instead of CLI/HTTP.)

### 1.5 Creating the batch job

**firectl:**

```bash
firectl batch-inference-job create \
  --model accounts/fireworks/models/llama-v3p1-8b-instruct \
  --input-dataset-id batch-input-dataset
```

With more parameters:

```bash
firectl batch-inference-job create \
  --job-id my-batch-job \
  --model accounts/fireworks/models/llama-v3p1-8b-instruct \
  --input-dataset-id batch-input-dataset \
  --output-dataset-id batch-output-dataset \
  --max-tokens 1024 \
  --temperature 0.7 \
  --top-p 0.9
```

**HTTP API:**

```bash
curl -X POST "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/batchInferenceJobs?batchInferenceJobId=my-batch-job" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "accounts/fireworks/models/llama-v3p1-8b-instruct",
    "inputDatasetId": "accounts/'${ACCOUNT_ID}'/datasets/batch-input-dataset",
    "outputDatasetId": "accounts/'${ACCOUNT_ID}'/datasets/batch-output-dataset",
    "inferenceParameters": {"maxTokens": 1024, "temperature": 0.7, "topP": 0.9}
  }'
```

### 1.6 Checking job status

**firectl:**

```bash
firectl batch-inference-job get my-batch-job     # a specific job
firectl batch-inference-job list                  # all jobs
```

**HTTP API:**

```bash
curl -X GET "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/batchInferenceJobs/my-batch-job" \
  -H "Authorization: Bearer ${API_KEY}"

curl -X GET "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/batchInferenceJobs" \
  -H "Authorization: Bearer ${API_KEY}"
```

### 1.7 Downloading output

**firectl:**

```bash
firectl dataset download batch-output-dataset
```

**HTTP API** (get signed URLs, then download each file):

```bash
curl -s -X GET "https://api.fireworks.ai/v1/accounts/${ACCOUNT_ID}/datasets/batch-output-dataset:getDownloadEndpoint" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{}' > download.json

jq -r '.filenameToSignedUrls | to_entries[] | "\(.key) \(.value)"' download.json | \
while read -r object_path signed_url; do
    fname=$(basename "$object_path")
    echo "Downloading → $fname"
    curl -L -o "$fname" "$signed_url"
done
```

> The output dataset contains **two files**: a results file (successful responses, JSONL) and an error file (failed requests with debugging info).

### 1.8 Job state reference

| State          | Description                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| **VALIDATING** | Dataset is being validated for format requirements                               |
| **PENDING**    | Job is queued and waiting for resources                                          |
| **RUNNING**    | Actively processing requests                                                     |
| **COMPLETED**  | All requests successfully processed                                              |
| **FAILED**     | Unrecoverable error occurred (check status message)                              |
| **EXPIRED**    | Exceeded the chosen time limit (12/24/48/72 hrs) — completed requests are saved   |

### 1.9 Resuming and lineage

**Resume processing** (only unfinished/failed requests from the original job):

```bash
firectl batch-inference-job create \
  --continue-from original-job-id \
  --model accounts/fireworks/models/llama-v3p1-8b-instruct \
  --output-dataset-id new-output-dataset
```

**Download the complete continuation chain:**

```bash
firectl dataset download output-dataset-id --download-lineage
```

---

## 2. Responses API

The Responses API supports more complex, **stateful** interactions than plain chat completions.

**Key capabilities:**

- **Continue conversations** — maintain context across turns without resending full history
- **Use external tools** — MCP/SSE tools (server-executed) or function tools (client-executed)
- **Stream responses** — real-time results
- **Control tool usage** — `max_tool_calls` parameter caps how many tool calls can happen
- **Manage data retention** — conversations stored by default; opt out with `store=false`

### 2.1 Creating a response

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.fireworks.ai/inference/v1",
    api_key=os.getenv("FIREWORKS_API_KEY", "YOUR_FIREWORKS_API_KEY_HERE")
)

response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="What is reward-kit and what are its 2 main features? Keep it short. Please analyze the fw-ai-external/reward-kit repository.",
    tools=[{"type": "sse", "server_url": "https://gitmcp.io/docs"}]
)

print(response.output[-1].content[0].text.split("</think>")[-1])
```

### 2.2 Using function tools

Function tools follow the OpenAI-compatible format and are returned to the client for **client-side execution** (unlike SSE/MCP tools, which run server-side).

```python
response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="What is the weather like in San Francisco?",
    tools=[{
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"}},
            "required": ["location"]
        }
    }],
    tool_choice="auto"
)

for item in response.output:
    if hasattr(item, 'type') and item.type == "tool_call":
        print(f"Function: {item.function.name}")
        print(f"Arguments: {item.function.arguments}")
```

### 2.3 Continuing a conversation with `previous_response_id`

Avoids resending the whole history — the API pulls context from the referenced prior response.

```python
initial_response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="What are the key features of reward-kit?",
    tools=[{"type": "sse", "server_url": "https://gitmcp.io/docs"}]
)
initial_response_id = initial_response.id

continuation_response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="How do I install it?",
    previous_response_id=initial_response_id,
    tools=[{"type": "sse", "server_url": "https://gitmcp.io/docs"}]
)

print(continuation_response.output[-1].content[0].text.split("</think>")[-1])
```

### 2.4 Streaming responses

```python
stream = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="give me 5 interesting facts on modelcontextprotocol/python-sdk -- keep it short!",
    stream=True,
    tools=[{"type": "mcp", "server_url": "https://mcp.deepwiki.com/mcp"}]
)

for chunk in stream:
    print(chunk)
```

### 2.5 Storing responses (`store` parameter)

By default `store=True` and responses can be referenced later by `id`. Set `store=False` to disable this — but then you **cannot** use `previous_response_id` to continue that conversation.

```python
response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="give me 5 interesting facts on modelcontextprotocol/python-sdk -- keep it short!",
    store=False,
    tools=[{"type": "mcp", "server_url": "https://mcp.deepwiki.com/mcp"}]
)

# This will fail because the previous response was not stored
try:
    continuation_response = client.responses.create(
        model="accounts/fireworks/models/qwen3-235b-a22b",
        input="Explain the second fact in more detail.",
        previous_response_id=response.id
    )
except Exception as e:
    print(e)
```

### 2.6 Deleting stored responses

Stored responses (`store=True`, the default) can be deleted immediately via the `DELETE` endpoint — this **permanently** removes the conversation data.

**Python:**

```python
client = OpenAI(
    base_url="https://api.fireworks.ai/inference/v1",
    api_key=os.getenv("FIREWORKS_API_KEY", "YOUR_FIREWORKS_API_KEY_HERE")
)

response = client.responses.create(
    model="accounts/fireworks/models/qwen3-235b-a22b",
    input="What is the capital of France?",
    store=True  # default
)
response_id = response.id
print(f"Created response with ID: {response_id}")

headers = {
    "Authorization": f"Bearer {os.getenv('FIREWORKS_API_KEY')}",
    "x-fireworks-account-id": "your-account-id"
}
delete_response = requests.delete(
    f"https://api.fireworks.ai/inference/v1/responses/{response_id}",
    headers=headers
)

if delete_response.status_code == 200:
    print("Response deleted successfully")
else:
    print(f"Failed to delete response: {delete_response.status_code}")
```

**curl:**

```bash
# Create a response and capture the ID
RESPONSE=$(curl -X POST https://api.fireworks.ai/inference/v1/responses \
  -H "Authorization: Bearer $FIREWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "accounts/fireworks/models/qwen3-235b-a22b", "input": "What is the capital of France?", "store": true}')

RESPONSE_ID=$(echo $RESPONSE | jq -r '.id')

curl -X DELETE "https://api.fireworks.ai/inference/v1/responses/$RESPONSE_ID" \
  -H "Authorization: Bearer $FIREWORKS_API_KEY" \
  -H "x-fireworks-account-id: your-account-id"
```

### 2.7 Response object structure

Every response includes:

- **`id`** — unique identifier (e.g. `resp_abc123...`)
- **`created_at`** — Unix timestamp
- **`status`** — typically `"completed"`
- **`model`** — model used
- **`output`** — array of message objects, tool calls, and tool outputs
- **`usage`** — token usage:
  - `prompt_tokens`, `completion_tokens`, `total_tokens`
  - `prompt_tokens_details.cached_tokens` — prompt tokens served from cache
- **`previous_response_id`** — the prior response in the conversation, if any
- **`store`** — whether this response was stored (boolean)
- **`max_tool_calls`** — cap on tool calls, if set

**Example response:**

```json
{
  "id": "resp_abc123...",
  "created_at": 1735000000,
  "status": "completed",
  "model": "accounts/fireworks/models/qwen3-235b-a22b",
  "output": [
    {
      "id": "msg_xyz789...",
      "role": "user",
      "content": [{"type": "input_text", "text": "What is 2+2?"}],
      "status": "completed"
    },
    {
      "id": "msg_def456...",
      "role": "assistant",
      "content": [{"type": "output_text", "text": "2 + 2 equals 4."}],
      "status": "completed"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 8,
    "total_tokens": 23,
    "prompt_tokens_details": {"cached_tokens": 0}
  },
  "previous_response_id": null,
  "store": true,
  "max_tool_calls": null
}
```

### 2.8 Further examples

The docs reference companion notebooks for: general MCP examples, `previous_response_id` usage, streaming responses, `store=False` usage, and MCP-with-streaming — useful starting points if you need runnable end-to-end notebooks rather than snippets.
