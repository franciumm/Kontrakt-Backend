# Fireworks AI — Tool Calling, Reasoning & Agentic Workflows

> Source: Fireworks AI developer documentation. Full doc index: https://docs.fireworks.ai/llms.txt
> Code samples in this file use **JavaScript** (Node) and the **Anthropic-compatible** endpoint where applicable.

This file covers function/tool calling, reasoning models (including interleaved and preserved thinking across turns), and model-specific agentic best practices for the Kimi K2 family.

---

## 1. Tool Calling (Function Calling)

Tool calling lets models intelligently select and use external tools based on user input, using OpenAI-compatible tool specifications. You can build agents that access APIs, retrieve real-time data, or perform actions.

**How it works:**

1. Define tools using JSON Schema (name, description, parameters)
2. The model analyzes the query and decides whether to call a tool
3. If needed, the model returns structured tool calls with parameters
4. You execute the tool and send results back for the final response

### 1.1 Quick example

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: { location: { type: "string", description: "City name" } },
      required: ["location"],
    },
  },
}];

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2-instruct-0905",
  messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  tools,
  temperature: 0.1,
});

console.log(response.choices[0].message.tool_calls);
// [{ id: 'call_abc123', type: 'function', function: { name: 'get_weather', arguments: '{"location":"San Francisco"}' } }]
```

### 1.2 Full multi-turn flow

```javascript
const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["location"],
    },
  },
}];

const messages = [{ role: "user", content: "What's the weather in San Francisco?" }];

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2-instruct-0905",
  messages,
  tools,
  temperature: 0.1,
});

if (response.choices[0].message.tool_calls) {
  const toolCall = response.choices[0].message.tool_calls[0];

  function getWeather({ location, unit = "celsius" }) {
    // In production, call your real weather API here
    return { temperature: 72, condition: "sunny", unit };
  }

  const functionArgs = JSON.parse(toolCall.function.arguments);
  const functionResponse = getWeather(functionArgs);

  messages.push(response.choices[0].message); // assistant's tool call
  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(functionResponse),
  });

  const finalResponse = await client.chat.completions.create({
    model: "accounts/fireworks/models/kimi-k2-instruct-0905",
    messages,
    tools,
    temperature: 0.1,
  });

  console.log(finalResponse.choices[0].message.content);
  // "It's currently 72°F and sunny in San Francisco."
}
```

### 1.3 Defining tools

Each tool requires:

- **`name`** — function identifier (`a-z`, `A-Z`, `0-9`, underscores, dashes; max 64 characters)
- **`description`** — clear explanation of what it does (the model uses this to decide when to call it)
- **`parameters`** — JSON Schema object describing the function's parameters

**Supported JSON Schema parameter types:** `string`, `number`, `integer`, `object`, `array`, `boolean`, `null`. You can also:

- Restrict values with `enum`
- Mark parameters `required` or optional
- Provide per-parameter `description`s
- Reuse subschemas via `$defs`/`definitions` and `$ref`, including **recursive references** (linked lists, trees, mutually recursive types)
- Carry `$id`, `$schema`, and other annotation keywords (no external fetches performed)

**Complex example with `$defs`:**

```javascript
const tools = [{
  type: "function",
  function: {
    name: "submit_order",
    description: "Submit an order with line items and a customer",
    parameters: {
      type: "object",
      $defs: {
        Product:  { type: "object", properties: { name: { type: "string" }, price: { type: "number" } }, required: ["name", "price"] },
        Customer: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name", "email"] },
      },
      properties: {
        items:    { type: "array", items: { $ref: "#/$defs/Product" } },
        customer: { $ref: "#/$defs/Customer" },
      },
      required: ["items", "customer"],
    },
  },
}];
```

### 1.4 `tool_choice`

Controls how the model uses tools:

- **`auto`** (default) — model decides whether to call a tool or respond directly
- **`none`** — model will not call any tools
- **`required`** — model must call at least one tool
- **Specific function** — force a particular function call

```javascript
const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2-instruct-0905",
  messages: [{ role: "user", content: "What's the weather?" }],
  tools,
  tool_choice: { type: "function", function: { name: "get_weather" } },
  temperature: 0.1,
});
```

### 1.5 Streaming tool calls

```javascript
const stream = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2-instruct-0905",
  messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  tools,
  stream: true,
  temperature: 0.1,
});

const toolCalls = {};

for await (const chunk of stream) {
  const delta = chunk.choices[0].delta;

  if (delta.tool_calls) {
    for (const toolCall of delta.tool_calls) {
      const index = toolCall.index;
      if (!toolCalls[index]) toolCalls[index] = { id: "", name: "", arguments: "" };
      if (toolCall.id) toolCalls[index].id = toolCall.id;
      if (toolCall.function?.name) toolCalls[index].name = toolCall.function.name;
      if (toolCall.function?.arguments) toolCalls[index].arguments += toolCall.function.arguments;
    }
  }

  if (chunk.choices[0].finish_reason === "tool_calls") {
    for (const toolCall of Object.values(toolCalls)) {
      const args = JSON.parse(toolCall.arguments);
      console.log(`Calling ${toolCall.name} with`, args);
    }
    break;
  }
}
```

### 1.6 Troubleshooting `$ref` errors

- **External `$ref` URI** (e.g. `https://example.com/schema.json`) — only in-document JSON Pointer fragments (`#/...`) are supported. Inline the referenced subschema or hoist it into `$defs`.
- **Wrong fragment path**, e.g. `#/components/schemas/Foo` when the document has no `components` key — match the pointer to the actual document layout.
- **Older deployment image** — recursive `$ref`, root `$id`, and nested `$defs` under a property all became supported in mid-2026; earlier images return `400` on those shapes. If you control a self-hosted/dedicated deployment, redeploy on a current image.

---

## 2. Reasoning

For thinking/reasoning models, Fireworks exposes the model's internal reasoning via a `reasoning_content` field on OpenAI-compatible responses (otherwise it would appear as `<think>...</think>` tags inside `content`). On the **Anthropic-compatible** endpoint, reasoning instead shows up as a `thinking` content block, matching Claude's native format — which is the recommended way to work with reasoning on Fireworks if you're already using Anthropic-style clients.

### 2.1 Basic usage (OpenAI-compatible)

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "What is 25 * 37?" }],
  model: "accounts/fireworks/models/<reasoning-model>",
});

const message = completion.choices[0].message;
if (message.reasoning_content) {
  console.log("Reasoning:", message.reasoning_content);
}
console.log("Answer:", message.content);
```

### 2.2 Controlling reasoning effort

**Option A — `reasoning_effort`** (string: `"low"`, `"medium"`, `"high"`):

```javascript
const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "Solve this step by step: If a train travels at 60 mph for 2.5 hours, how far does it go?" }],
  model: "accounts/fireworks/models/<reasoning-model>",
  reasoning_effort: "medium",
});
```

**Option B — `thinking`** (Anthropic-native format, also accepted on the OpenAI-compatible endpoint):

```javascript
const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "Solve this step by step: If a train travels at 60 mph for 2.5 hours, how far does it go?" }],
  model: "accounts/fireworks/models/<reasoning-model>",
  thinking: { type: "enabled", budget_tokens: 4096 }, // must be >= 1024
});
```

### 2.3 Streaming with reasoning content

```javascript
const stream = await client.chat.completions.create({
  messages: [{ role: "user", content: "What is the square root of 144?" }],
  model: "accounts/fireworks/models/<reasoning-model>",
  reasoning_effort: "medium",
  stream: true,
});

let reasoning = "";
let content = "";

for await (const chunk of stream) {
  const delta = chunk.choices[0].delta;
  if (delta.reasoning_content) reasoning += delta.reasoning_content;
  if (delta.content) content += delta.content;
}

console.log("Reasoning:", reasoning);
console.log("Answer:", content);
```

### 2.4 Interleaved thinking (within a single turn, across tool calls)

When building multi-turn tool-calling agents with models that support interleaved thinking, you **must** include the reasoning content from previous assistant turns in subsequent requests so the model can think between tool calls and after receiving tool results.

**OpenAI-compatible client — two ways to preserve reasoning context:**

**1. Pass the message object directly (recommended)** — the response's message object already carries `reasoning_content` alongside `content` and `tool_calls`:

```javascript
const assistantMessage = firstResponse.choices[0].message;
// assistantMessage.reasoning_content -> "The user is asking for addition..."
// assistantMessage.tool_calls -> [{ id: "...", function: {...} }]

const secondResponse = await client.chat.completions.create({
  messages: [
    { role: "user", content: "What is 15 + 27?" },
    assistantMessage, // full message object, reasoning_content included
    { role: "tool", content: "42", tool_call_id: assistantMessage.tool_calls[0].id },
  ],
  model: "accounts/fireworks/models/<reasoning-model>",
  tools,
});
```

**2. Manually reconstruct the message** when building message objects yourself:

```javascript
const assistantMessage = firstResponse.choices[0].message;

const secondResponse = await client.chat.completions.create({
  messages: [
    { role: "user", content: "What is 15 + 27?" },
    {
      role: "assistant",
      content: assistantMessage.content,
      reasoning_content: assistantMessage.reasoning_content, // include reasoning
      tool_calls: assistantMessage.tool_calls,
    },
    { role: "tool", content: "42", tool_call_id: assistantMessage.tool_calls[0].id },
  ],
  model: "accounts/fireworks/models/<reasoning-model>",
  tools,
});
```

### 2.5 Interleaved thinking — Anthropic-compatible client

This is the most natural way to work with interleaved thinking on Fireworks, since `thinking` and `tool_use` blocks are native to the Anthropic Messages format.

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference",
});

const tools = [
  {
    name: "calculator",
    description: "Perform basic arithmetic operations",
    input_schema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["operation", "a", "b"],
    },
  },
];

// First turn: thinking + tool_use
const firstResponse = await client.messages.create({
  model: "accounts/fireworks/models/<reasoning-model>",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 4096 },
  messages: [{ role: "user", content: "What is 15 + 27? Use the calculator." }],
  tools,
});

// Response content includes [thinking_block, tool_use_block]
for (const block of firstResponse.content) {
  if (block.type === "thinking") {
    console.log(`Thinking: ${block.thinking.slice(0, 100)}...`);
  } else if (block.type === "tool_use") {
    console.log(`Tool: ${block.name}(${JSON.stringify(block.input)})`);
  }
}

const toolUse = firstResponse.content.find((b) => b.type === "tool_use");

// Second turn: pass back the full content array (with thinking blocks) + tool result
const secondResponse = await client.messages.create({
  model: "accounts/fireworks/models/<reasoning-model>",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 4096 },
  messages: [
    { role: "user", content: "What is 15 + 27? Use the calculator." },
    { role: "assistant", content: firstResponse.content },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "42" }],
    },
  ],
  tools,
});

// The model thinks again (interleaved) and produces a text answer
for (const block of secondResponse.content) {
  if (block.type === "thinking") {
    console.log(`Thinking: ${block.thinking.slice(0, 100)}...`);
  } else if (block.type === "text") {
    console.log(`Answer: ${block.text}`);
  }
}
```

> Under the hood, different base models render this differently in their raw prompt format — e.g. Kimi K2 family models use `<|tool_calls_section_begin|>...<|tool_calls_section_end|>` markers; MiniMax-M2 uses `<minimax:tool_call><invoke name="...">` XML-style calls; GLM models use `<tool_call>{name}<arg_key>...` tags. This is internal formatting — the Anthropic-compatible API surface above stays consistent regardless of which underlying model you point at.

### 2.6 Preserved thinking (across multiple user turns)

While interleaved thinking preserves reasoning within one turn across tool calls, **preserved thinking** extends this across multiple user turns, so the model retains earlier reasoning in later parts of the conversation.

**OpenAI-compatible client**, controlled via the **`reasoning_history`** parameter:

```javascript
const completion = await client.chat.completions.create({
  messages: [
    { role: "user", content: "What is 15 + 27?" },
    assistantMessage, // contains reasoning_content from the previous turn
    { role: "user", content: "Now multiply that by 2" },
  ],
  model: "accounts/fireworks/models/<reasoning-model>",
  reasoning_history: "preserved", // retain all previous reasoning content
});
```

**Anthropic-compatible client**, by passing forward each prior turn's full `content` array (including its `thinking` blocks):

```javascript
const secondResponse = await client.messages.create({
  model: "accounts/fireworks/models/<reasoning-model>",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 4096 },
  messages: [
    { role: "user", content: "What is 15 + 27?" },
    { role: "assistant", content: firstResponse.content }, // includes thinking blocks
    { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "42" }] },
  ],
  tools,
});

const thirdResponse = await client.messages.create({
  model: "accounts/fireworks/models/<reasoning-model>",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 4096 },
  messages: [
    { role: "user", content: "What is 15 + 27?" },
    { role: "assistant", content: firstResponse.content },
    { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "42" }] },
    { role: "assistant", content: secondResponse.content }, // preserves this turn's thinking too
    { role: "user", content: "Now multiply that by 2" },
  ],
  tools,
});
```

When reasoning history is preserved, every prior turn's thinking content is present in the raw prompt sent to the model — not just the most recent turn.

---

## 3. Kimi K2 family — agentic best practices

### 3.1 Always set `max_tokens`

Kimi K2 family models can produce very long reasoning traces before reaching a final answer. In agentic workflows where output is parsed and passed downstream, **always set `max_tokens` explicitly**:

```javascript
const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/kimi-k2-instruct",
  messages,
  max_tokens: 512,
  tools,
});
```

**Suggested starting points by output type:**

| Output type          | Suggested `max_tokens` |
| --------------------- | ----------------------- |
| Tool call responses   | 256–512                 |
| Short text            | 512–1024                |
| Structured JSON       | 1024–2048               |
| Long-form reasoning   | 4096+                   |

### 3.2 Tool schema design

Kimi K2 family models perform best when tools have **clearly distinct** names, descriptions, and parameter schemas — overlapping surface areas can cause the model to pick the wrong tool.

```javascript
// Less clear — overlapping descriptions
const tools = [
  { type: "function", function: { name: "read", description: "Read data from a source", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "exec", description: "Execute an operation on a source", parameters: { type: "object", properties: {} } } },
];

// More clear — distinct names and explicit scope
const betterTools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at a given path. Use this to inspect existing content before making changes. Do not use this to run code.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Run a shell command and return its output. Use this to run scripts, tests, or system operations. Do not use this to read file contents.",
      parameters: { type: "object", properties: {} },
    },
  },
];
```

**Best practices:**
- Name tools by their **primary action**, not their domain (`read_file`, not `file_tool`)
- Write descriptions that **distinguish** tools from each other, including what each tool is *not* for
- Avoid optional parameters that make two tools look identical except for a flag

### 3.3 Timeouts for agentic loops

Inference for Kimi K2 family models can be slow on large inputs. For multi-step agents, set your client's read timeout to **at least 10–30 minutes** per call (see `01_fireworks_api_fundamentals.md` §4 for full timeout guidance).