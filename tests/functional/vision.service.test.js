import { test } from 'node:test';
import assert from 'node:assert/strict';

import { transcribeImages } from '../../src/services/vision.service.js';
import { mockCreate, chatResponse, abortError } from '../helpers/fireworks-mock.js';

test('transcribeImages — returns {text, truncated:false} on normal stop', async () => {
  const mock = mockCreate(chatResponse('PAGE ONE TEXT\fPAGE TWO TEXT', { finish_reason: 'stop' }));
  try {
    const result = await transcribeImages(['img1', 'img2']);
    assert.equal(result.truncated, false);
    assert.match(result.text, /PAGE ONE TEXT/);
    assert.match(result.text, /PAGE TWO TEXT/);
    const call = mock.getCalls()[0];
    assert.equal(call.params.messages[0].role, 'system');
    assert.equal(call.params.messages[1].role, 'user');
    // Page-boundary text markers interleaved between images.
    const textParts = call.params.messages[1].content.filter((c) => c.type === 'text');
    assert.ok(textParts.length >= 3, 'expected begin + per-page + end markers');
    assert.match(textParts[0].text, /Begin page 1 of 2/);
    assert.match(textParts[1].text, /Begin page 2 of 2/);
    assert.match(textParts.at(-1).text, /End of all pages/);
  } finally {
    mock.restore();
  }
});

test('transcribeImages — flags truncation when finish_reason is "length"', async () => {
  const mock = mockCreate(chatResponse('partial transcription', { finish_reason: 'length' }));
  try {
    const result = await transcribeImages(['img1']);
    assert.equal(result.truncated, true);
  } finally {
    mock.restore();
  }
});

test('transcribeImages — throws 502 on empty transcription', async () => {
  const mock = mockCreate(chatResponse('   ', { finish_reason: 'stop' }));
  try {
    await assert.rejects(
      () => transcribeImages(['img1']),
      (err) => err.statusCode === 502 && /empty transcription/i.test(err.message)
    );
  } finally {
    mock.restore();
  }
});

test('transcribeImages — retries once on 502 (transient) then succeeds', async () => {
  const transient502 = Object.assign(new Error('upstream bad gateway'), { status: 502 });
  const mock = mockCreate([transient502, chatResponse('OK TEXT', { finish_reason: 'stop' })]);
  try {
    const result = await transcribeImages(['img1']);
    assert.equal(result.text, 'OK TEXT');
    assert.equal(mock.getCalls().length, 2, 'expected exactly one retry');
  } finally {
    mock.restore();
  }
});

test('transcribeImages — retries once on 429 (transient)', async () => {
  const transient429 = Object.assign(new Error('rate limited'), { status: 429 });
  const mock = mockCreate([transient429, chatResponse('OK TEXT', { finish_reason: 'stop' })]);
  try {
    const result = await transcribeImages(['img1']);
    assert.equal(result.text, 'OK TEXT');
  } finally {
    mock.restore();
  }
});

test('transcribeImages — does NOT retry on 400 (non-transient)', async () => {
  const badRequest = Object.assign(new Error('bad request'), { status: 400 });
  const mock = mockCreate([badRequest, chatResponse('should not reach', { finish_reason: 'stop' })]);
  try {
    await assert.rejects(() => transcribeImages(['img1']), /bad request/);
    assert.equal(mock.getCalls().length, 1, 'must not retry on 400');
  } finally {
    mock.restore();
  }
});

test('transcribeImages — gives up after retry fails again', async () => {
  const persistent = Object.assign(new Error('still 503'), { status: 503 });
  const mock = mockCreate([persistent, persistent]);
  try {
    await assert.rejects(() => transcribeImages(['img1']), /still 503/);
    assert.equal(mock.getCalls().length, 2, 'must try once + retry = 2 calls');
  } finally {
    mock.restore();
  }
});

test('transcribeImages — rejects empty image array', async () => {
  await assert.rejects(
    () => transcribeImages([]),
    (err) => err.statusCode === 400
  );
});

test('transcribeImages — passes safe_tokenization: true', async () => {
  const mock = mockCreate(chatResponse('text', { finish_reason: 'stop' }));
  try {
    await transcribeImages(['img1']);
    assert.equal(mock.getCalls()[0].params.safe_tokenization, true);
  } finally {
    mock.restore();
  }
});
