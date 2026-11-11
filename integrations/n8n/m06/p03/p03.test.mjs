import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  processEventWithReply,
  OUTBOUND_REPLY_CONTRACT_VERSION,
  OUTBOUND_REPLY_TEXT_LIMIT,
} from './processor.mjs';

const contract = { version: 'm06-p03-v1', max_code_points: 500 };

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
      reply: { should_send: true, text: '✅ Gasto registrado! R$ 35,00.\nRef: ABC123', contract },
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

const runGenerated = (candidate, integration, runtime = {}) => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  const source = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters
    .jsCode;
  const binding = /const integration = \{\n  verify: async \(\) => null,[\s\S]*?\n\};/;
  assert.equal((source.match(binding) ?? []).length, 1);
  const code = source.replace(binding, 'const integration = __integration;');
  return vm.runInNewContext(`(async () => { ${code} })()`, {
    $input: { first: () => ({ json: { body: candidate } }) },
    __integration: integration,
    setTimeout: runtime.setTimeout,
  });
};

async function nextTimer(queue) {
  for (let i = 0; i < 30 && queue.length === 0; i++) await Promise.resolve();
  assert.equal(queue.length, 1, 'a bounded timer must be scheduled before another send');
  return queue.shift();
}

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

test('sends M08 query_summary reply verbatim only to its verified sender', async () => {
  const summary = 'Resumo Empresa (01/11/2026 a 30/11/2026)\nReceitas ordinárias: R$ 2.500,00\nDespesas brutas: R$ 35,00\nEstornos: R$ 0,00\nDespesas líquidas: R$ 35,00\nResultado líquido: R$ 2.465,00';
  const sent = [];
  const result = await processEventWithReply(
    event,
    deps({
      finance: async () => ({
        status: 200,
        body: {
          data: {
            result: { type: 'query_summary' },
            reply: { should_send: true, text: summary, contract },
          },
        },
      }),
      send: async (message) => {
        sent.push(message);
        return { status: 200 };
      },
    }),
  );
  assert.deepEqual(result, { stage: 'sent', status: 200, possiblyDeliveredEarlier: false });
  assert.deepEqual(sent, [{ recipient: event.sender, text: summary }]);
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
      finance: async () => ({
        status: 200,
        body: { data: { reply: { should_send: true, contract } } },
      }),
    }),
  );
  assert.equal(malformed.stage, 'invalid_finance_reply');
  const inconsistent = await processEventWithReply(
    event,
    deps({
      finance: async () => ({
        status: 200,
        body: {
          data: {
            result: { type: 'ignored' },
            reply: { should_send: true, text: 'unsafe', contract },
          },
        },
      }),
    }),
  );
  assert.equal(inconsistent.stage, 'invalid_finance_reply');
});

test('versioned reply bound fails explicitly on mismatch before outbound send', async () => {
  assert.equal(OUTBOUND_REPLY_CONTRACT_VERSION, contract.version);
  assert.equal(OUTBOUND_REPLY_TEXT_LIMIT, contract.max_code_points);
  const coreSource = readFileSync(
    new URL('../../../../packages/core/src/application/inbox/present-reply.ts', import.meta.url),
    'utf8',
  );
  assert.match(coreSource, /REPLY_TEXT_LIMIT = 500;/);
  assert.match(coreSource, /REPLY_CONTRACT_VERSION = 'm06-p03-v1';/);
  for (const override of [
    { version: contract.version, max_code_points: 501 },
    { version: 'future', max_code_points: 500 },
    undefined,
  ]) {
    let sends = 0;
    const result = await processEventWithReply(
      event,
      deps({
        finance: async () => ({
          status: 200,
          body: {
            data: {
              result: { type: 'transaction_created' },
              reply: { should_send: true, text: 'safe', contract: override },
            },
          },
        }),
        send: async () => {
          sends++;
          return { status: 200 };
        },
      }),
    );
    assert.deepEqual(result, { stage: 'reply_contract_mismatch', status: 200 });
    assert.equal(sends, 0);
  }
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

test('generated Code node awaits 1s/2s for outbound 500, 503 and timeout without re-ingest', async () => {
  for (const firstFailure of [500, 503, 'timeout']) {
    const timers = [],
      sent = [],
      financeCalls = [];
    const integration = {
      verify: async (value) => Object.freeze({ ...value }),
      configuredInstance: 'local',
      financeTransport: async (request) => {
        financeCalls.push(request);
        return accepted;
      },
      sendTransport: async (request) => {
        sent.push(request);
        if (sent.length === 1)
          return firstFailure === 'timeout'
            ? Promise.reject({ code: 'ETIMEDOUT' })
            : { status: firstFailure };
        return sent.length === 2 ? { status: 503 } : { status: 200 };
      },
    };
    const run = runGenerated(event, integration, {
      setTimeout: (callback, delay) => timers.push({ callback, delay }),
    });
    const firstTimer = await nextTimer(timers);
    assert.equal(firstTimer.delay, 1000);
    assert.equal(financeCalls.length, 1);
    assert.equal(sent.length, 1);
    firstTimer.callback();
    const secondTimer = await nextTimer(timers);
    assert.equal(secondTimer.delay, 2000);
    assert.equal(financeCalls.length, 1);
    assert.equal(sent.length, 2);
    secondTimer.callback();
    const result = await run;
    assert.equal(result[0].json.stage, 'sent');
    assert.equal(result[0].json.possiblyDeliveredEarlier, firstFailure === 'timeout');
    assert.equal(financeCalls.length, 1);
    assert.equal(sent.length, 3);
    for (const request of sent) {
      assert.equal(request.credentialRef, 'evolution:send');
      assert.equal(request.message.recipient, event.sender);
      assert.equal(request.message.text, accepted.body.data.reply.text);
    }
  }
});

test('generated Code node honors capped 429 delta and HTTP-date Retry-After', async () => {
  for (const [retryAfter, expectedDelay] of [
    ['45', 30000],
    ['Wed, 28 Oct 2026 12:00:07 GMT', 7000],
  ]) {
    let financeCalls = 0,
      sends = 0;
    const timers = [];
    const result = await runGenerated(
      event,
      {
        verify: async (value) => ({ ...value }),
        configuredInstance: 'local',
        now: () => Date.parse('2026-10-28T12:00:00Z'),
        financeTransport: async () => {
          financeCalls++;
          return accepted;
        },
        sendTransport: async () => {
          sends++;
          return sends === 1 ? { status: 429, retryAfter } : { status: 200 };
        },
      },
      {
        setTimeout: (callback, delay) => {
          timers.push(delay);
          callback();
        },
      },
    );
    assert.equal(result[0].json.stage, 'sent');
    assert.deepEqual(timers, [expectedDelay]);
    assert.equal(financeCalls, 1);
    assert.equal(sends, 2);
  }
});

test('generated Code node rejects untrusted, group, from_me and Finance 401/403 without send', async () => {
  for (const [candidate, verify] of [
    [{ ...event }, async () => null],
    [{ ...event, isGroup: true }, async (value) => ({ ...value })],
    [{ ...event, fromMe: true }, async (value) => ({ ...value })],
  ]) {
    let finances = 0,
      sends = 0;
    const result = await runGenerated(candidate, {
      verify,
      configuredInstance: 'local',
      financeTransport: async () => {
        finances++;
        return accepted;
      },
      sendTransport: async () => {
        sends++;
        return { status: 200 };
      },
    });
    assert.equal(result[0].json.stage, 'rejected');
    assert.equal(finances, 0);
    assert.equal(sends, 0);
  }
  for (const status of [401, 403]) {
    let finances = 0,
      sends = 0;
    const result = await runGenerated(event, {
      verify: async (value) => ({ ...value }),
      configuredInstance: 'local',
      financeTransport: async () => {
        finances++;
        return { status };
      },
      sendTransport: async () => {
        sends++;
        return { status: 200 };
      },
    });
    assert.equal(result[0].json.stage, 'finance_failed');
    assert.equal(result[0].json.status, status);
    assert.equal(finances, 1);
    assert.equal(sends, 0);
  }
});

test('generated Code node fails closed when the retry timer is missing or throws', async () => {
  for (const setTimeout of [
    undefined,
    () => {
      throw new Error('timer unavailable');
    },
  ]) {
    let finances = 0,
      sends = 0;
    const result = await runGenerated(
      event,
      {
        verify: async (value) => ({ ...value }),
        configuredInstance: 'local',
        financeTransport: async () => {
          finances++;
          return accepted;
        },
        sendTransport: async () => {
          sends++;
          return { status: 503 };
        },
      },
      { setTimeout },
    );
    assert.equal(result[0].json.stage, 'send_failed');
    assert.equal(result[0].json.possiblyDelivered, false);
    assert.equal(finances, 1);
    assert.equal(sends, 1);
  }
});
