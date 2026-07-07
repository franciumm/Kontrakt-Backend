# Fireworks AI — Embeddings, Reranking, Structured Outputs & Predicted Outputs

> Source: Fireworks AI developer documentation. Full doc index: https://docs.fireworks.ai/llms.txt
> Code samples in this file use **JavaScript** (Node) and the **Anthropic-compatible** endpoint where applicable.

This file covers three related "shape the output" capabilities: generating embeddings and reranking documents, forcing structured (schema-conformant) output, and speeding up generation with predicted outputs.

---

## 1. Embeddings & Reranking

Fireworks hosts embedding and reranking models for tasks like RAG and semantic search.

### 1.1 Generating embeddings

The embeddings service is OpenAI-compatible (`/v1/embeddings`). Refer to OpenAI's embeddings guide/docs for general usage patterns.

```javascript
const response = await fetch("https://api.fireworks.ai/inference/v1/embeddings", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    input: "The quick brown fox jumped over the lazy dog",
    model: "fireworks/qwen3-embedding-8b",
  }),
});

const data = await response.json();
console.log(data);
```

Or with the OpenAI-compatible Node client:

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const embedding = await client.embeddings.create({
  model: "fireworks/qwen3-embedding-8b",
  input: "The quick brown fox jumped over the lazy dog",
});

console.log(embedding.data[0].embedding);
```

To get variable-length embeddings, add a `dimensions` parameter (e.g. `dimensions: 128`).

The API usage is identical whether the underlying model is BERT-based or LLM-based — always `/v1/embeddings` with your chosen model string.

### 1.2 Model availability

**Fireworks-hosted embeddings (Qwen3 Embeddings family):**

- `fireworks/qwen3-embedding-8b` *(available on serverless)*
- `fireworks/qwen3-embedding-4b`
- `fireworks/qwen3-embedding-0p6b`

**Other models usable for embedding-style workflows / referenced alongside:**

- `fireworks/glm-4p5`
- `fireworks/gpt-oss-20b`
- `fireworks/kimi-k2-instruct-0905`
- `fireworks/deepseek-r1-0528`

**Community embedding models:**

- `nomic-ai/nomic-embed-text-v1.5`
- `nomic-ai/nomic-embed-text-v1`
- `WhereIsAI/UAE-Large-V1`
- `thenlper/gte-large`
- `thenlper/gte-base`
- `BAAI/bge-base-en-v1.5`
- `BAAI/bge-small-en-v1.5`
- `mixedbread-ai/mxbai-embed-large-v1`
- `sentence-transformers/all-MiniLM-L6-v2`
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

### 1.3 Reranking documents

**Option A — `/rerank` endpoint** (simple interface):

```javascript
const response = await fetch("https://api.fireworks.ai/inference/v1/rerank", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "fireworks/qwen3-reranker-8b",
    query: "What is the capital of France?",
    documents: [
      "Paris is the capital and largest city of France, home to the Eiffel Tower and the Louvre Museum.",
      "France is a country in Western Europe known for its wine, cuisine, and rich history.",
      "The weather in Europe varies significantly between northern and southern regions.",
      "JavaScript is a popular programming language used for web development.",
    ],
    top_n: 3,
    return_documents: true,
  }),
});

const data = await response.json();
console.log(data);
```

Available reranker models (Qwen3 Reranker family):

- `fireworks/qwen3-reranker-8b` *(available on serverless)*
- `fireworks/qwen3-reranker-4b`
- `fireworks/qwen3-reranker-0p6b`

**Option B — `/embeddings` endpoint with `return_logits`** (supports more models, more parallelism control):

The embedding model takes token IDs for "yes"/"no" and returns logits indicating relevance. These token IDs are a fixed property of the Qwen3 tokenizer, so you only need to look them up once (offline) and hardcode them — the runtime call itself needs nothing beyond `fetch`.

```javascript
const url = "https://api.fireworks.ai/inference/v1/embeddings";

const query = "What is the capital of France?";
const documents = [
  "Paris is the capital and largest city of France, home to the Eiffel Tower and the Louvre Museum.",
  "France is a country in Western Europe known for its wine, cuisine, and rich history.",
  "The weather in Europe varies significantly between northern and southern regions.",
  "JavaScript is a popular programming language used for web development.",
];

const instruction = "Given a web search query, retrieve relevant passages that answer the query";
const prompts = documents.map(
  (doc) => `<Instruct>: ${instruction}\n<Query>: ${query}\n<Document>: ${doc}`
);

// Token IDs for "no" and "yes" in Qwen3 reranker models (fixed, precomputed values)
const TOKEN_FALSE_ID = 2753;
const TOKEN_TRUE_ID = 9454;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "fireworks/qwen3-reranker-8b",
    input: prompts,
    return_logits: [TOKEN_FALSE_ID, TOKEN_TRUE_ID],
    normalize: true, // applies softmax to the selected logits
  }),
});

const { data } = await response.json();

const results = data
  .map((item, i) => ({
    index: i,
    relevanceScore: item.embedding[1], // "yes" probability
    document: documents[i],
  }))
  .sort((a, b) => b.relevanceScore - a.relevanceScore);

for (const result of results) {
  console.log(`Score: ${result.relevanceScore.toFixed(4)} - ${result.document.slice(0, 80)}...`);
}
```

With `normalize=true`, softmax is applied to the selected logits so the "yes" probability directly represents the relevance score.

**Parallel/batched reranking:**

```javascript
const url = "https://api.fireworks.ai/inference/v1/embeddings";
const TOKEN_FALSE_ID = 2753;
const TOKEN_TRUE_ID = 9454;
const headers = {
  "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
  "Content-Type": "application/json",
};

async function rerankBatch(batchPrompts) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "fireworks/qwen3-reranker-8b",
      input: batchPrompts,
      return_logits: [TOKEN_FALSE_ID, TOKEN_TRUE_ID],
      normalize: true,
    }),
  });
  return response.json();
}

async function rerankParallel(prompts, batchSize = 100) {
  const batches = [];
  for (let i = 0; i < prompts.length; i += batchSize) {
    batches.push(prompts.slice(i, i + batchSize));
  }

  const results = await Promise.all(batches.map(rerankBatch));

  const allScores = [];
  for (const result of results) {
    for (const item of result.data) {
      allScores.push(item.embedding[1]); // "yes" probability
    }
  }
  return allScores;
}

const scores = await rerankParallel(prompts);
```

### 1.4 Deploying embeddings/reranking models

`qwen3-embedding-8b` and `qwen3-reranker-8b` are available on serverless, but you can also deploy them via on-demand (dedicated) deployments — see `02_fireworks_deployments_guide.md`.

---

## 2. Structured Outputs

Structured outputs force model responses to conform to a schema, making them reliably parseable. Fireworks supports **JSON mode** (schema-based) and **Grammar mode** (custom BNF grammars).

### 2.1 Quick start

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const resultSchema = {
  type: "object",
  properties: { winner: { type: "string" } },
  required: ["winner"],
};

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2p5",
  response_format: {
    type: "json_schema",
    json_schema: { name: "Result", schema: resultSchema },
  },
  messages: [
    { role: "user", content: "Who won the US presidential election in 2012? Reply in JSON format." },
  ],
});

console.log(response.choices[0].message.content);
// {"winner": "Barack Obama"}
```

### 2.2 Response format options

- **`json_object`** — force any valid JSON, no specific schema
- **`json_schema`** — enforce a specific schema (recommended)

```javascript
const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2p5",
  response_format: { type: "json_object" },
  messages: [{ role: "user", content: "List the top 3 programming languages in JSON format." }],
});
```

This mirrors OpenAI's JSON mode. It works with both the Chat Completions and Completions APIs. When using **Tool Calling**, JSON mode is enabled automatically and these response-format settings don't apply.

### 2.3 JSON Schema support

Fireworks supports most of JSON Schema 2020-12, plus Draft-7 keyword aliases (`definitions`) for backward compatibility.

**Supported:**
- Types: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`
- Object constraints: `properties`, `required`, `additionalProperties`
- Array constraints: `items`
- Composition: `anyOf`, `allOf`
- Reuse: `$defs` (2020-12) and `definitions` (Draft-7), via `$ref`
- Annotations: `$id`, `$schema`, `description`, `title`, `default`
- Recursive references (self-recursive `$ref`, mutually recursive `$defs`)

**Not yet supported:**
- `oneOf` composition
- Length/size constraints (`minLength`, `maxLength`, `minItems`, `maxItems`)
- Regular expressions (`pattern`)
- External `$ref` URIs (HTTP/file) — only in-document JSON Pointer fragments resolve

### 2.4 JSON Pointer references (`$ref`)

`$ref` follows RFC 6901 JSON Pointer syntax. Fireworks supports **two pointer forms in the same document**:

1. **Fully-qualified pointer** (strict-spec) — e.g. `#/properties/A/$defs/Foo`. Points to the exact location; portable across any conformant 2020-12 implementation.
2. **Bare shorthand** `#/$defs/Foo` (Fireworks extension) — when `Foo` lives inside a nested subschema (e.g. `properties.A.$defs.Foo`), Fireworks lifts every nested `$defs`/`definitions` entry into a root pool so the bare pointer still resolves. Most schema generators (OpenAPI tooling, Zod-to-JSON-Schema, TypeBox, etc.) emit this shape, so this keeps them working without rewrites. **Not portable** — strict validators return `PointerToNowhere` for the same pointer.

**Name-collision precedence for the bare shorthand:**
- A **root-level** `$defs[Foo]` always wins over a nested one with the same name. The fully-qualified pointer to the nested entry still works and addresses that nested definition specifically.
- **Nested vs. nested** (no root entry): first occurrence in document order wins, and the server logs a warning. Give shared definitions distinct names, or hoist them to root, to avoid ambiguity.
- `$defs` and `definitions` are independent pools — `#/$defs/Foo` and `#/definitions/Foo` address different schemas, per spec.

**Recursive example (linked-list node):**

```json
{
  "$defs": {
    "linked_list_node": {
      "type": "object",
      "properties": {
        "value": {"type": "integer"},
        "next": {
          "anyOf": [
            {"$ref": "#/$defs/linked_list_node"},
            {"type": "null"}
          ]
        }
      },
      "required": ["value"]
    }
  },
  "$ref": "#/$defs/linked_list_node"
}
```

### 2.5 Example: schema + reasoning content together

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const qaSchema = {
  type: "object",
  properties: {
    question: { type: "string" },
    answer: { type: "string" },
  },
  required: ["question", "answer"],
};

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2p5",
  messages: [{
    role: "user",
    content: `Who wrote 'Pride and Prejudice'?\n\nReply in JSON matching this schema:\n${JSON.stringify(qaSchema, null, 2)}`,
  }],
  max_tokens: 1000,
});

// Fireworks attaches `reasoning_content` to the message object at runtime
// (it isn't part of the official OpenAI SDK types, but it's present on the response).
const reasoning = response.choices[0].message.reasoning_content;
let content = response.choices[0].message.content.trim();

if (content.startsWith("```")) {
  content = content.split("\n").slice(1).join("\n").split("```")[0].trim();
}

const qaResult = JSON.parse(content);

if (reasoning) console.log("Reasoning:", reasoning);
console.log("Result:", JSON.stringify(qaResult, null, 2));
```

Reasoning mode alongside structured output is useful for: **debugging** (why did the model produce this?), **auditing** (documenting the decision process), and **complex tasks** where the reasoning is as valuable as the final answer. See `04_fireworks_agentic_workflows.md` for the full Reasoning guide.

### 2.6 Grammar Mode

For cases where JSON isn't sufficient, Grammar mode constrains output using custom BNF grammars. Good for:

- Classification tasks (limit output to a predefined list of options)
- Language-specific output (force specific languages/character sets)
- Custom formats beyond JSON

---

## 3. Predicted Outputs

Use Predicted Outputs to speed up generation when you already have a strong guess of what the output will look like — e.g., editing or rewriting a document/code snippet.

Set the `prediction` field to your best guess of the output. Example: editing a survey to add a new option.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const code = `{
"questions": [
    {"question": "Name", "type": "text"},
    {"question": "Age", "type": "number"},
    {"question": "Feedback", "type": "text_area"},
    {"question": "How to Contact", "type": "multiple_choice", "options": ["Email", "Phone"], "optional": true}
  ]
}
`;

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  messages: [
    {
      role: "user",
      content: "Edit the How to Contact question to add an option called Text Message. Output the full edited code, with no markdown or explanations.",
    },
    { role: "user", content: code },
  ],
  temperature: 0,
  prediction: { type: "content", content: code },
});

console.log(response.choices[0].message.content);
```

**Notes:**

- Predicted Outputs is **free** at this time.
- Recommend `temperature=0` for best results in most use cases — at temperature 0, using Predicted Outputs does not reduce output quality.
- If the prediction is substantially different from the actual generated output, generation speed may *decrease*.
- Max length of the `prediction` field is governed by `max_tokens` (default 2048) — increase `max_tokens` if your input/prediction is longer.
- On on-demand deployments, you can set `rewrite_speculation=true` for potentially even faster generation (rolling out to serverless soon).