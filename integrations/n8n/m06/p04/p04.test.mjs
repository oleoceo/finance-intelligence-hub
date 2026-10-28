import test from 'node:test';
import assert from 'node:assert/strict';
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
