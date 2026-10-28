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
const workflowCode = () => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  assert.equal(
    workflow.connections['Synthetic webhook entry'].main[0][0].node,
    'Fail-closed verification and ingest boundary',
  );
  return workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters.jsCode;
};
const runWorkflow = (event, integration, runtime = {}) => {
  let code = workflowCode();
  if (integration) {
    const defaultBinding = /const integration = \{\n  verify: async \(\) => null,[\s\S]*?\n\};/;
    assert.equal((code.match(defaultBinding) ?? []).length, 1);
    code = code.replace(defaultBinding, 'const integration = __integration;');
  }
  return vm.runInNewContext(`(async () => { ${code} })()`, {
    $input: { first: () => ({ json: { body: event } }) },
    __integration: integration,
    setTimeout: runtime.setTimeout,
  });
};
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
  assert.deepEqual(retryDecision(429, '5', 1), { retry: true, delayMs: 5000 });
  assert.deepEqual(
    retryDecision(429, 'Thu, 01 Jan 2026 12:00:05 GMT', 1, Date.parse('2026-01-01T12:00:00Z')),
    { retry: true, delayMs: 5000 },
  );
  assert.deepEqual(retryDecision(429, 'invalid', 1), { retry: true, delayMs: 30000 });
  assert.deepEqual(retryDecision(429, '-5', 1), { retry: true, delayMs: 30000 });
  assert.deepEqual(retryDecision(429, undefined, 1), { retry: true, delayMs: 30000 });
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
      if (attempt === 1) throw Object.assign(new Error('transport failure'), { code: 'ETIMEDOUT' });
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
  const result = await runWorkflow(base());
  assert.equal(result[0].json.stage, 'rejected');
});
test('normalization refuses unverified data', () =>
  assert.equal(normalize(base(), null, instance), null));
test('generated workflow routes only independently verified private text to mock Finance', async () => {
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
    const attested = new WeakSet();
    const integration = {
      verify: async (event) => (attested.has(event) ? Object.freeze({ ...event }) : null),
      configuredInstance: instance,
      financeTransport: async ({ method, path, credentialRef, body }) => {
        assert.equal(method, 'POST');
        assert.equal(path, '/api/v1/inbox/messages');
        assert.equal(credentialRef, 'finance:ingest');
        const response = await fetch(url, {
          method,
          headers: {
            authorization: 'Bearer synthetic-ingest-only',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        return { status: response.status };
      },
    };
    const trusted = base();
    attested.add(trusted);
    const result = await runWorkflow(trusted, integration);
    assert.equal(result[0].json.stage, 'accepted');
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0], normalize(base(), base(), instance));
    const rejectedWorkflow = [
      ['untrusted', { ...base() }, false],
      ['spoofed', { ...base(), trusted: true }, false],
      ['wrong instance', { ...base(), instance: 'other' }, true],
      ['group', { ...base(), isGroup: true }, true],
      ['from_me', { ...base(), fromMe: true }, true],
      ['malformed', { ...base(), messageId: undefined }, true],
    ];
    for (const [name, event, trustedOrigin] of rejectedWorkflow) {
      if (trustedOrigin) attested.add(event);
      const rejectedResult = await runWorkflow(event, integration);
      assert.equal(rejectedResult[0].json.stage, 'rejected', name);
      assert.equal(bodies.length, 1, name);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('thrown authorization and unknown errors terminate after one call', async () => {
  for (const error of [
    { status: 401 },
    { response: { status: 403 } },
    new Error('programming failure'),
  ]) {
    let count = 0;
    const result = await processEvent(base(), {
      verify,
      configuredInstance: instance,
      finance: async () => {
        count++;
        throw error;
      },
    });
    assert.equal(count, 1);
    assert.equal(result.stage, 'failed');
    assert.equal(result.reason, 'FINANCE_INGEST_FAILED');
    assert.equal(result.status, error.status ?? error.response?.status);
  }
});

test('processEvent honors bounded Retry-After seconds and HTTP-date with stable identity', async () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  for (const [header, expected] of [
    ['5', 5000],
    ['Thu, 01 Jan 2026 12:00:05 GMT', 5000],
    ['Thu, 01 Jan 2026 12:01:00 GMT', 30000],
    [undefined, 30000],
    ['malformed', 30000],
  ]) {
    const calls = [],
      delays = [];
    const result = await processEvent(base(), {
      verify,
      configuredInstance: instance,
      now: () => now,
      finance: async (envelope) => {
        calls.push(envelope);
        return calls.length === 1 ? { status: 429, retryAfter: header } : { status: 202 };
      },
      wait: async (ms) => delays.push(ms),
    });
    assert.equal(result.stage, 'accepted');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.deepEqual(delays, [expected]);
  }
});

const flushWorkflow = () => new Promise((resolve) => setImmediate(resolve));
const assertGeneratedRetry = async (responses, expectedDelays, expectedStage, now) => {
  const calls = [];
  const delays = [];
  const pending = [];
  const integration = {
    verify,
    configuredInstance: instance,
    now: () => now,
    financeTransport: async ({ body }) => {
      calls.push(body);
      const response = responses[calls.length - 1];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  const resultPromise = runWorkflow(base(), integration, {
    setTimeout: (resolve, ms) => {
      delays.push(ms);
      pending.push(resolve);
    },
  });
  for (let index = 0; index < expectedDelays.length; index++) {
    await flushWorkflow();
    assert.equal(calls.length, index + 1, 'later Finance call must await the timer');
    assert.deepEqual(delays, expectedDelays.slice(0, index + 1));
    assert.equal(pending.length, 1);
    pending.shift()();
  }
  const result = await resultPromise;
  assert.equal(result[0].json.stage, expectedStage);
  assert.equal(calls.length, responses.length);
  assert.ok(calls.length <= 3);
  assert.deepEqual(
    calls.map(({ source, source_instance, source_message_id, raw_text }) => [
      source,
      source_instance,
      source_message_id,
      raw_text,
    ]),
    Array.from({ length: calls.length }, () => [
      'whatsapp',
      instance,
      'synthetic-message-1',
      'synthetic text',
    ]),
  );
};

test('generated workflow awaits 1s/2s before 500, 503 and transient retries', async () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  await assertGeneratedRetry(
    [{ status: 500 }, { status: 503 }, { status: 503 }],
    [1000, 2000],
    'failed',
    now,
  );
  await assertGeneratedRetry(
    [
      Object.assign(new Error('transport'), { code: 'ETIMEDOUT' }),
      { status: 503 },
      { status: 202 },
    ],
    [1000, 2000],
    'accepted',
    now,
  );
});

test('generated workflow awaits bounded 429 delta-seconds and HTTP-date', async () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  for (const [header, delay] of [
    ['5', 5000],
    ['Thu, 01 Jan 2026 12:00:05 GMT', 5000],
    ['60', 30000],
    ['Thu, 01 Jan 2026 12:01:00 GMT', 30000],
  ])
    await assertGeneratedRetry(
      [{ status: 429, retryAfter: header }, { status: 429, retryAfter: header }, { status: 202 }],
      [delay, delay],
      'accepted',
      now,
    );
});

test('generated workflow terminates 401, 403 and unknown exceptions without waiting', async () => {
  for (const failure of [{ status: 401 }, { response: { status: 403 } }, new Error('bug')]) {
    let calls = 0;
    let timers = 0;
    const result = await runWorkflow(
      base(),
      {
        verify,
        configuredInstance: instance,
        financeTransport: async () => {
          calls++;
          throw failure;
        },
      },
      {
        setTimeout: () => {
          timers++;
        },
      },
    );
    assert.equal(result[0].json.stage, 'failed');
    assert.equal(calls, 1);
    assert.equal(timers, 0);
  }
});

test('generated workflow fails closed on transient response when timer is unavailable', async () => {
  let calls = 0;
  const result = await runWorkflow(base(), {
    verify,
    configuredInstance: instance,
    financeTransport: async () => {
      calls++;
      return { status: 503 };
    },
  });
  assert.equal(result[0].json.stage, 'failed');
  assert.equal(calls, 1);
});
