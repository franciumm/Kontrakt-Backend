// Mock helper for the provider singletons. Services import the OpenAI client
// object from src/providers/fireworks.provider.js OR amd.provider.js and call
// methods on its `.chat.completions` surface — we patch `create` in place on
// BOTH singletons so a test doesn't need to know which provider a service uses
// (vision → AMD, audit/classifier → Fireworks). Calls land in one shared list.
//
// Each test file runs in its own worker, so global state is fine within a file.
import client from '../../src/providers/fireworks.provider.js';
import amdClient, { classifier as amdClassifierClient } from '../../src/providers/amd.provider.js';

/**
 * Patch chat.completions.create with a handler on every provider singleton.
 *
 * handler can be:
 *   - a static value (returned as-is)
 *   - an Error (thrown)
 *   - a function (params, options, callIndex) => result | Promise<result>
 *   - an array (consumed sequentially, each item is value/Error/function)
 *
 * @returns {{ getCalls: () => Array, restore: () => void }}
 */
export function mockCreate(handler) {
  const calls = [];
  const targets = [client, amdClient, amdClassifierClient];
  const originals = targets.map((c) => c.chat.completions.create.bind(c.chat.completions));

  let queue = Array.isArray(handler) ? [...handler] : null;
  const single = !queue ? handler : null;

  const stub = async function (params, options) {
    calls.push({ params, options });
    let next;
    if (queue) {
      if (queue.length === 0) throw new Error('fireworks-mock: queue exhausted');
      next = queue.shift();
    } else {
      next = single;
    }
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return await next(params, options, calls.length);
    return next;
  };

  targets.forEach((c) => {
    c.chat.completions.create = stub;
  });

  return {
    getCalls: () => calls,
    restore: () => {
      targets.forEach((c, i) => {
        c.chat.completions.create = originals[i];
      });
    },
  };
}

/** Builds an OpenAI-shaped non-streaming response. */
export function chatResponse(content, { finish_reason = 'stop', model = 'test-model' } = {}) {
  return {
    id: 'test-id',
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason }],
  };
}

/** Builds an async-iterable that yields OpenAI-shaped streaming chunks. */
export function streamResponse(chunks, { model = 'test-model' } = {}) {
  const deltaChunks = chunks.map((content) => ({
    id: 'test-id',
    object: 'chat.completion.chunk',
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  }));
  // Final chunk with finish_reason for cleanliness.
  deltaChunks.push({
    id: 'test-id',
    object: 'chat.completion.chunk',
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  });

  return {
    async *[Symbol.asyncIterator]() {
      for (const c of deltaChunks) yield c;
    },
  };
}

/** AbortError mimic. */
export function abortError() {
  const e = new Error('The user aborted a request');
  e.name = 'AbortError';
  return e;
}
