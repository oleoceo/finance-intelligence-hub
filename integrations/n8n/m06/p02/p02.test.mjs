import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createServer } from 'node:http';
import { normalize, processEvent, retryDecision } from './processor.mjs';

const instance = 'synthetic-instance-a';
const base = () => ({
  instance,
  messageId: 'synthetic-message-1',
  sender: '00000000000',
  corroboratingSender: '00000000000',
  receivedAt: '2026-01-01T12:00:00Z',
  text: 'synthetic text',
  kind: 'message',
  contentKind: 'text',
  isGroup: false,
  fromMe: false,
});
const verify = async (event) => Object.freeze({ ...event }); // Isolated synthetic verifier only.
const run = async (event, options = {}) => {
  const calls = [];
  const result = await processEvent(event, {
    verify: options.verify ?? verify,
    configuredInstance: instance,
    finance: async (envelope) => {
      calls.push(envelope);
      return options.response ?? { status: 202 };
    },
    wait: options.wait ?? (async () => {}),
  });
  return { calls, result };
};

test('trusted private text maps exactly and calls Finance once', async () => {
  const { calls, result } = await run(base());
  assert.equal(result.stage, 'accepted');
  assert.deepEqual(calls, [
    {
      source: 'whatsapp',
      source_instance: instance,
      source_message_id: 'synthetic-message-1',
      sender_reference: '00000000000',
      received_at: '2026-01-01T12:00:00Z',
      raw_text: 'synthetic text',
      message_context: { is_group: false, from_me: false },
    },
  ]);
});
test('same event replay retains canonical identity', async () => {
  const first = await run(base()),
    second = await run(base());
  assert.deepEqual(first.calls[0], second.calls[0]);
});
const rejected = [
  ['untrusted origin', {}, async () => null],
  ['spoofed authorized sender', { sender: '00000000000', trusted: true }, async () => null],
  ['wrong instance', { instance: 'synthetic-instance-b' }],
  ['conflicting sender', { corroboratingSender: '11111111111' }],
  ['missing sender', { sender: undefined }],
  ['missing ID', { messageId: undefined }],
  ['unknown metadata', { senderAlias: '11111111111' }],
  ['unsupported event', { kind: 'status' }],
  ['non-text event', { contentKind: 'image' }],
  ['group', { isGroup: true }],
  ['from_me', { fromMe: true }],
  ['malformed timestamp', { receivedAt: '2026-02-30T12:00:00Z' }],
  ['timezone-free', { receivedAt: '2026-01-01T12:00:00' }],
  ['missing text', { text: undefined }],
];
for (const [name, change, verifier] of rejected)
  test(`${name}: zero Finance calls`, async () => {
    const { calls, result } = await run({ ...base(), ...change }, { verify: verifier });
    assert.equal(result.stage, 'rejected');
    assert.equal(calls.length, 0);
  });
test('post-verification mutable metadata is rejected', async () => {
  const event = base();
  const snapshot = { ...event };
  event.messageId = 'tampered';
  const { calls, result } = await run(event, { verify: async () => snapshot });
  assert.equal(result.stage, 'rejected');
  assert.equal(calls.length, 0);
});
test('retry classifier bounds transient, timeout, 429 and terminal errors', () => {
  for (const status of [500, 503, 'timeout'])
    assert.equal(retryDecision(status, undefined, 1).retry, true);
  assert.deepEqual(retryDecision(429, '60', 1), { retry: true, delayMs: 30000 });
  for (const status of [400, 401, 403, 409, 422])
    assert.equal(retryDecision(status, undefined, 1).retry, false);
  assert.equal(retryDecision(503, undefined, 3).retry, false);
});
test('timeout and 503 retry at most three times with identical identity', async () => {
  const calls = [],
    delays = [];
  let attempt = 0;
  const result = await processEvent(base(), {
    verify,
    configuredInstance: instance,
    finance: async (envelope) => {
      calls.push(envelope);
      attempt++;
      if (attempt === 1) throw new Error('timeout');
      return { status: 503 };
    },
    wait: async (ms) => delays.push(ms),
  });
  assert.equal(result.stage, 'failed');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual(delays, [1000, 2000]);
});
test('401 and 403 are terminal and produce no outbound response', async () => {
  for (const status of [401, 403]) {
    const { calls, result } = await run(base(), { response: { status } });
    assert.equal(calls.length, 1);
    assert.deepEqual(result, { stage: 'failed', status, reason: 'FINANCE_INGEST_FAILED' });
  }
});
test('importable template executes fail-closed against a synthetic webhook', async () => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  const code = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters.jsCode;
  const result = await vm.runInNewContext(`(async () => { ${code} })()`, {
    $input: { first: () => ({ json: { body: base() } }) },
  });
  assert.equal(result[0].json.stage, 'rejected');
});
test('normalization refuses unverified data', () =>
  assert.equal(normalize(base(), null, instance), null));
test('local trusted webhook reaches mocked Finance HTTP endpoint once', async () => {
  const bodies = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.url, '/api/v1/inbox/messages');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer synthetic-ingest-only');
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(JSON.parse(body));
    response.writeHead(202).end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/inbox/messages`;
    const result = await processEvent(base(), {
      verify,
      configuredInstance: instance,
      finance: async (envelope) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            authorization: 'Bearer synthetic-ingest-only',
            'content-type': 'application/json',
          },
          body: JSON.stringify(envelope),
        });
        return { status: response.status };
      },
    });
    assert.equal(result.stage, 'accepted');
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0], normalize(base(), base(), instance));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
