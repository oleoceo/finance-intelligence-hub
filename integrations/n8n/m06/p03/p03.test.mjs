import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { processEventWithReply } from './processor.mjs';

const event = {
  instance: 'local',
  messageId: 'message-1',
  sender: '5511999999999',
  corroboratingSender: '5511999999999',
  receivedAt: '2026-10-28T12:00:00Z',
  text: '35 almoço',
  kind: 'message',
  contentKind: 'text',
  isGroup: false,
  fromMe: false,
};
const accepted = {
  status: 200,
  body: {
    data: {
      result: { type: 'transaction_created' },
      reply: { should_send: true, text: '✅ Gasto registrado! R$ 35,00.\nRef: ABC123' },
    },
  },
};
const deps = (patch = {}) => ({
  verify: async () => ({ ...event }),
  configuredInstance: 'local',
  finance: async () => accepted,
  send: async () => ({ status: 200 }),
  wait: async () => {},
  now: () => Date.parse('2026-10-28T12:00:00Z'),
  ...patch,
});

test('sends Finance text verbatim to verified sender without financial interpretation', async () => {
  const calls = [];
  const result = await processEventWithReply(
    event,
    deps({
      send: async (message) => {
        calls.push(message);
        return { status: 200 };
      },
    }),
  );
  assert.deepEqual(result, { stage: 'sent', status: 200, possiblyDeliveredEarlier: false });
  assert.deepEqual(calls, [{ recipient: event.sender, text: accepted.body.data.reply.text }]);
});

test('suppresses no-reply outcomes and rejects malformed Finance replies', async () => {
  for (const type of ['ignored', 'duplicate_message', 'processing', 'stale_claim']) {
    let sends = 0;
    const result = await processEventWithReply(
      event,
      deps({
        finance: async () => ({
          status: 200,
          body: { data: { result: { type }, reply: { should_send: false } } },
        }),
        send: async () => {
          sends++;
        },
      }),
    );
    assert.equal(result.stage, 'accepted_no_reply');
    assert.equal(sends, 0);
  }
  const malformed = await processEventWithReply(
    event,
    deps({
      finance: async () => ({ status: 200, body: { data: { reply: { should_send: true } } } }),
    }),
  );
  assert.equal(malformed.stage, 'invalid_finance_reply');
  const inconsistent = await processEventWithReply(
    event,
    deps({
      finance: async () => ({
        status: 200,
        body: {
          data: { result: { type: 'ignored' }, reply: { should_send: true, text: 'unsafe' } },
        },
      }),
    }),
  );
  assert.equal(inconsistent.stage, 'invalid_finance_reply');
});

test('401/403 and terminal 4xx never send; Finance retry retains canonical identity', async () => {
  for (const status of [400, 401, 403, 409, 422]) {
    let sends = 0;
    const result = await processEventWithReply(
      event,
      deps({
        finance: async () => ({ status }),
        send: async () => {
          sends++;
        },
      }),
    );
    assert.deepEqual(result, { stage: 'finance_failed', status });
    assert.equal(sends, 0);
  }
  const envelopes = [],
    delays = [];
  const result = await processEventWithReply(
    event,
    deps({
      finance: async (envelope) => {
        envelopes.push(envelope);
        return envelopes.length < 3 ? { status: 503 } : accepted;
      },
      wait: async (delay) => {
        delays.push(delay);
      },
    }),
  );
  assert.equal(result.stage, 'sent');
  assert.equal(envelopes.length, 3);
  assert.deepEqual(envelopes[0], envelopes[1]);
  assert.deepEqual(envelopes[1], envelopes[2]);
  assert.deepEqual(delays, [1000, 2000]);
});

test('outbound retries never re-ingest and ambiguous timeout remains explicit', async () => {
  let ingests = 0,
    sends = 0;
  const delays = [];
  const result = await processEventWithReply(
    event,
    deps({
      finance: async () => {
        ingests++;
        return accepted;
      },
      send: async () => {
        sends++;
        if (sends === 1) throw { code: 'ETIMEDOUT' };
        if (sends === 2) return { status: 503 };
        return { status: 200 };
      },
      wait: async (delay) => {
        delays.push(delay);
      },
    }),
  );
  assert.equal(ingests, 1);
  assert.equal(sends, 3);
  assert.deepEqual(delays, [1000, 2000]);
  assert.deepEqual(result, { stage: 'sent', status: 200, possiblyDeliveredEarlier: true });
});

test('outbound 429 honors bounded Retry-After; 4xx is terminal', async () => {
  let attempts = 0;
  const delays = [];
  const result = await processEventWithReply(
    event,
    deps({
      send: async () => {
        attempts++;
        return attempts === 1 ? { status: 429, retryAfter: '90' } : { status: 200 };
      },
      wait: async (delay) => {
        delays.push(delay);
      },
    }),
  );
  assert.equal(result.stage, 'sent');
  assert.deepEqual(delays, [30000]);
  for (const status of [400, 401, 403, 409, 422]) {
    const failed = await processEventWithReply(event, deps({ send: async () => ({ status }) }));
    assert.deepEqual(failed, { stage: 'send_failed', status, possiblyDelivered: false });
  }
});

test('generated workflow stays inactive and fail closed', async () => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  const code = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters.jsCode;
  const result = await vm.runInNewContext(`(async () => { ${code} })()`, {
    $input: { first: () => ({ json: { body: event } }) },
  });
  assert.equal(result[0].json.stage, 'rejected');
  assert.doesNotMatch(code, /finance:admin/);
});

test('generated workflow dispatches verbatim through separate credential and skips suppressed reply', async () => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
  const source = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters
    .jsCode;
  const binding = /const integration = \{\n  verify: async \(\) => null,[\s\S]*?\n\};/;
  assert.equal((source.match(binding) ?? []).length, 1);
  const code = source.replace(binding, 'const integration = __integration;');
  const calls = [];
  let response = accepted;
  const integration = {
    verify: async (value) => Object.freeze({ ...value }),
    configuredInstance: 'local',
    financeTransport: async (request) => {
      calls.push(['finance', request]);
      return response;
    },
    sendTransport: async (request) => {
      calls.push(['send', request]);
      return { status: 200 };
    },
  };
  const run = () =>
    vm.runInNewContext(`(async () => { ${code} })()`, {
      $input: { first: () => ({ json: { body: event } }) },
      __integration: integration,
      setTimeout: (callback) => callback(),
    });
  const sent = await run();
  assert.equal(sent[0].json.stage, 'sent');
  assert.equal(calls[0][1].credentialRef, 'finance:ingest');
  assert.equal(calls[1][1].credentialRef, 'evolution:send');
  assert.equal(calls[1][1].message.text, accepted.body.data.reply.text);
  assert.equal(calls[1][1].message.recipient, event.sender);
  calls.length = 0;
  response = {
    status: 200,
    body: { data: { result: { type: 'duplicate_message' }, reply: { should_send: false } } },
  };
  const suppressed = await run();
  assert.equal(suppressed[0].json.stage, 'accepted_no_reply');
  assert.equal(calls.length, 1);
});
