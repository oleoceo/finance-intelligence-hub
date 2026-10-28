import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { processEventWithReply } from '../p03/processor.mjs';

const event = Object.freeze({
  instance: 'local',
  messageId: 'stable-message',
  sender: '5511999999999',
  corroboratingSender: '5511999999999',
  receivedAt: '2026-10-28T12:00:00Z',
  text: 'gastei 35 almoço',
  kind: 'message',
  contentKind: 'text',
  isGroup: false,
  fromMe: false,
});
const success = {
  status: 200,
  body: {
    data: {
      result: { type: 'transaction_created' },
      reply: {
        should_send: true,
        text: 'Gasto registrado.',
        contract: { version: 'm06-p03-v1', max_code_points: 500 },
      },
    },
  },
};
const duplicate = {
  status: 200,
  body: {
    data: {
      result: { type: 'duplicate_message' },
      reply: { should_send: false },
    },
  },
};

function runGenerated(candidate, integration, setTimeout) {
  const workflow = JSON.parse(
    readFileSync(new URL('../p03/workflow.json', import.meta.url), 'utf8'),
  );
  assert.equal(workflow.active, false);
  const source = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code').parameters
    .jsCode;
  const binding = /const integration = \{\n  verify: async \(\) => null,[\s\S]*?\n\};/;
  assert.equal((source.match(binding) ?? []).length, 1);
  return vm.runInNewContext(
    `(async () => { ${source.replace(binding, 'const integration = __integration;')} })()`,
    {
      $input: { first: () => ({ json: { body: candidate } }) },
      __integration: integration,
      setTimeout,
    },
  );
}

async function nextTimer(queue) {
  for (let i = 0; i < 30 && queue.length === 0; i++) await Promise.resolve();
  assert.equal(queue.length, 1, 'retry must await a bounded timer');
  return queue.shift();
}

test('generated Code node retries lost post-commit Finance response with the exact identity and suppresses duplicate send', async () => {
  const finance = [],
    send = [],
    timers = [];
  const committed = new Set();
  const integration = {
    verify: async (candidate) => ({ ...candidate }),
    configuredInstance: 'local',
    financeTransport: async (request) => {
      finance.push(request);
      const envelope = request.body;
      const identity = [envelope.source, envelope.source_instance, envelope.source_message_id].join(
        '|',
      );
      if (committed.has(identity)) return duplicate;
      committed.add(identity);
      throw { code: 'ETIMEDOUT', secret: 'finance-secret' };
    },
    sendTransport: async (request) => {
      send.push(request);
      return { status: 200 };
    },
  };
  const resultPromise = runGenerated(event, integration, (callback, delay) =>
    timers.push({ callback, delay }),
  );
  const timer = await nextTimer(timers);
  assert.equal(timer.delay, 1000);
  assert.equal(finance.length, 1);
  assert.equal(send.length, 0);
  timer.callback();
  const result = await resultPromise;
  assert.equal(result[0].json.stage, 'accepted_no_reply');
  assert.equal(committed.size, 1);
  assert.equal(finance.length, 2);
  assert.deepEqual(
    finance.map((call) => call.body.source),
    ['whatsapp', 'whatsapp'],
  );
  assert.equal(finance[0].body.source_instance, finance[1].body.source_instance);
  assert.equal(finance[0].body.source_message_id, finance[1].body.source_message_id);
  assert.equal(finance[0].body.source_message_id, event.messageId);
  assert.equal(send.length, 0);
  assert.ok(!JSON.stringify(result).includes('finance-secret'));
});

test('generated Code node bounds reply-only retries and preserves ambiguous outbound timeout', async () => {
  const finance = [],
    send = [],
    timers = [];
  const integration = {
    verify: async (candidate) => ({ ...candidate }),
    configuredInstance: 'local',
    financeTransport: async (request) => {
      finance.push(request);
      return success;
    },
    sendTransport: async (request) => {
      send.push(request);
      throw { code: 'ETIMEDOUT', secret: 'provider-secret' };
    },
  };
  const resultPromise = runGenerated(event, integration, (callback, delay) =>
    timers.push({ callback, delay }),
  );
  for (const delay of [1000, 2000]) {
    const timer = await nextTimer(timers);
    assert.equal(timer.delay, delay);
    assert.equal(finance.length, 1);
    timer.callback();
  }
  const result = await resultPromise;
  assert.equal(result[0].json.stage, 'send_failed');
  assert.equal(result[0].json.status, 'timeout');
  assert.equal(result[0].json.possiblyDelivered, true);
  assert.equal(finance.length, 1);
  assert.equal(send.length, 3);
  assert.ok(
    send.every(
      (call) =>
        call.message.recipient === event.sender &&
        call.message.text === success.body.data.reply.text,
    ),
  );
  assert.ok(!JSON.stringify(result).includes('provider-secret'));
});

test('generated Code node rejects untrusted ingress before Finance or outbound calls', async () => {
  let finance = 0,
    send = 0;
  const result = await runGenerated(event, {
    verify: async () => null,
    configuredInstance: 'local',
    financeTransport: async () => {
      finance++;
      return success;
    },
    sendTransport: async () => {
      send++;
      return { status: 200 };
    },
  });
  assert.equal(result[0].json.stage, 'rejected');
  assert.equal(finance, 0);
  assert.equal(send, 0);
});

function fixture(overrides = {}) {
  const calls = { finance: [], send: [], wait: [] };
  const committed = new Set();
  let loseFirstResponse = false;
  const deps = {
    verify: async (candidate) => ({ ...candidate }),
    configuredInstance: 'local',
    finance: async (envelope) => {
      calls.finance.push({ ...envelope });
      const key = [envelope.source, envelope.source_instance, envelope.source_message_id].join('|');
      if (committed.has(key)) return duplicate;
      committed.add(key);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw { code: 'ETIMEDOUT' };
      }
      return success;
    },
    send: async (message) => {
      calls.send.push({ ...message });
      return { status: 200 };
    },
    wait: async (ms) => {
      calls.wait.push(ms);
    },
    now: () => Date.parse(event.receivedAt),
    ...overrides,
  };
  return {
    calls,
    committed,
    deps,
    loseResponse: () => {
      loseFirstResponse = true;
    },
  };
}

test('verified duplicate is non-sendable and creates one logical effect', async () => {
  const f = fixture();
  assert.equal((await processEventWithReply(event, f.deps)).stage, 'sent');
  assert.equal((await processEventWithReply(event, f.deps)).stage, 'accepted_no_reply');
  assert.equal(f.committed.size, 1);
  assert.equal(f.calls.finance.length, 2);
  assert.equal(f.calls.send.length, 1);
  assert.deepEqual(f.calls.finance[0], f.calls.finance[1]);
});

test('lost Finance response retries the same identity without inventing a sent reply', async () => {
  const f = fixture();
  f.loseResponse();
  assert.equal((await processEventWithReply(event, f.deps)).stage, 'accepted_no_reply');
  assert.equal(f.committed.size, 1);
  assert.equal(f.calls.finance.length, 2);
  assert.deepEqual(f.calls.finance[0], f.calls.finance[1]);
  assert.deepEqual(f.calls.wait, [1000]);
  assert.equal(f.calls.send.length, 0);
});

test('send failure retries only the immutable Finance text and redacts operational result', async () => {
  const f = fixture();
  f.deps.send = async (message) => {
    f.calls.send.push({ ...message });
    throw { status: 503, secret: 'provider-secret', rawText: event.text };
  };
  const result = await processEventWithReply(event, f.deps);
  assert.deepEqual(result, { stage: 'send_failed', status: 503, possiblyDelivered: false });
  assert.equal(f.committed.size, 1);
  assert.equal(f.calls.finance.length, 1);
  assert.equal(f.calls.send.length, 3);
  assert.deepEqual(f.calls.wait, [1000, 2000]);
  assert.ok(
    f.calls.send.every(
      (call) => call.recipient === event.sender && call.text === success.body.data.reply.text,
    ),
  );
  assert.ok(!JSON.stringify(result).includes('provider-secret'));
});

test('ambiguous outbound timeout preserves uncertainty through bounded retries', async () => {
  const f = fixture();
  f.deps.send = async (message) => {
    f.calls.send.push(message);
    throw { code: 'ETIMEDOUT' };
  };
  assert.deepEqual(await processEventWithReply(event, f.deps), {
    stage: 'send_failed',
    status: 'timeout',
    possiblyDelivered: true,
  });
  assert.equal(f.calls.finance.length, 1);
  assert.equal(f.calls.send.length, 3);
  assert.deepEqual(f.calls.wait, [1000, 2000]);
});

test('untrusted, conflicting, group and from_me replay never reaches Finance or outbound', async () => {
  for (const patch of [
    { verify: async () => null },
    { verify: async (candidate) => ({ ...candidate, sender: '5511888888888' }) },
    { verify: async (candidate) => ({ ...candidate, isGroup: true }) },
    { verify: async (candidate) => ({ ...candidate, fromMe: true }) },
  ]) {
    const f = fixture(patch);
    assert.equal((await processEventWithReply(event, f.deps)).stage, 'rejected');
    assert.equal(f.calls.finance.length, 0);
    assert.equal(f.calls.send.length, 0);
    assert.equal(f.committed.size, 0);
  }
});
