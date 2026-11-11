import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { authenticate, mapEvolution, runLive } from './adapter.mjs';

const credentials = Object.fromEntries(
  ['webhook', 'finance', 'evolution'].map((k) => [k, randomBytes(32).toString('hex')]),
);
const config = {
  enabled: true,
  instance: 'synthetic-lab',
  instanceId: 'synthetic-uuid',
  ownerJid: '5511000000000@s.whatsapp.net',
  evolutionUrl: 'https://evolution.invalid',
};
const body = () => ({
  event: 'messages.upsert',
  instance: config.instance,
  sender: config.ownerJid,
  data: {
    key: { id: 'TEST123', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
    message: { conversation: '35 almoço nubank' },
    messageType: 'conversation',
    messageTimestamp: 1793275200,
    instanceId: config.instanceId,
  },
});
const input = () => ({ headers: { 'x-finance-webhook': credentials.webhook }, body: body() });
const replyText = 'Texto da Finance.\nSem alterações.';
const response = {
  statusCode: 200,
  body: {
    data: {
      result: { type: 'transaction_created' },
      reply: {
        should_send: true,
        text: replyText,
        contract: { version: 'm06-p03-v1', max_code_points: 500 },
      },
    },
  },
};
const wait = async () => {};

test('authentication is external to payload and handles missing, duplicate and unicode headers', () => {
  assert.equal(authenticate(input().headers, credentials.webhook), true);
  for (const value of [undefined, [], [credentials.webhook], '😀'.repeat(64), 'x'.repeat(64)])
    assert.equal(authenticate({ 'x-finance-webhook': value }, credentials.webhook), false);
});

test('maps provider message timestamp, ID and private sender; outer sender is the Lab account', () => {
  const mapped = mapEvolution(body(), config);
  assert.equal(mapped.sender, '5511999999999');
  assert.equal(mapped.corroboratingSender, mapped.sender);
  assert.equal(mapped.receivedAt, new Date(1793275200000).toISOString());
  assert.equal(mapped.text, body().data.message.conversation);
  assert.equal(Object.isFrozen(mapped), true);
});

test('maps authenticated Evolution LID-normalized private message to the corroborated phone', async () => {
  const candidate = input();
  candidate.body.data.key.addressingMode = 'lid';
  candidate.body.data.key.remoteJidAlt = candidate.body.data.key.remoteJid;
  const mapped = mapEvolution(candidate.body, config);
  assert.equal(mapped.sender, '5511999999999');
  assert.equal(mapped.corroboratingSender, mapped.sender);
  const calls = [];
  const result = await runLive(
    candidate,
    config,
    credentials,
    async (request) => {
      calls.push(request);
      return response;
    },
    wait,
  );
  assert.equal(result.stage, 'sent');
  assert.equal(calls[0].body.sender_reference, '5511999999999');
  assert.equal(calls[0].body.source_message_id, 'TEST123');
});

for (const [label, mutate] of [
  ['wrong instance', (b) => (b.instance = 'other')],
  ['wrong UUID', (b) => (b.data.instanceId = 'other')],
  ['wrong owner', (b) => (b.sender = '5511222222222@s.whatsapp.net')],
  ['non-message event', (b) => (b.event = 'messages.update')],
  ['group', (b) => (b.data.key.remoteJid = '123456789@g.us')],
  ['own message', (b) => (b.data.key.fromMe = true)],
  ['missing direction', (b) => delete b.data.key.fromMe],
  ['LID', (b) => (b.data.key.remoteJid = '123456789@lid')],
  [
    'alternate conflicting sender',
    (b) => (b.data.key.remoteJidAlt = '5511222222222@s.whatsapp.net'),
  ],
  ['LID addressing without corroborating alternate', (b) => (b.data.key.addressingMode = 'lid')],
  [
    'LID addressing with conflicting alternate',
    (b) => {
      b.data.key.addressingMode = 'lid';
      b.data.key.remoteJidAlt = '5511222222222@s.whatsapp.net';
    },
  ],
  [
    'LID addressing with raw LID alternate',
    (b) => {
      b.data.key.addressingMode = 'lid';
      b.data.key.remoteJidAlt = '123456789@lid';
    },
  ],
  ['participant', (b) => (b.data.key.participant = '5511222222222@s.whatsapp.net')],
  ['unknown identity metadata', (b) => (b.data.sender = '5511999999999')],
  ['unknown key metadata', (b) => (b.data.key.trusted = true)],
  ['unknown root metadata', (b) => (b.trusted = true)],
  ['missing ID', (b) => delete b.data.key.id],
  ['malformed timestamp', (b) => (b.data.messageTimestamp = '1793275200')],
  ['non-text', (b) => (b.data.messageType = 'imageMessage')],
  ['multiple contents', (b) => (b.data.message.imageMessage = {})],
  ['batch', (b) => (b.data = [b.data])],
])
  test(`rejects ${label} before any HTTP request`, async () => {
    const candidate = input();
    mutate(candidate.body);
    assert.deepEqual(
      await runLive(candidate, config, credentials, () => assert.fail('HTTP forbidden'), wait),
      { stage: 'rejected' },
    );
  });

test('forged payload apikey cannot replace webhook authentication', async () => {
  const candidate = input();
  candidate.headers = {};
  candidate.body.apikey = credentials.evolution;
  assert.deepEqual(
    await runLive(candidate, config, credentials, () => assert.fail('HTTP forbidden'), wait),
    { stage: 'rejected' },
  );
});
test('disabled release does no work; credential reuse and HTTP Evolution are rejected', async () => {
  const noHttp = () => assert.fail('HTTP forbidden');
  assert.deepEqual(await runLive(null, { enabled: false }, {}, noHttp, wait), {
    stage: 'disabled',
  });
  assert.deepEqual(
    await runLive(input(), config, { ...credentials, finance: credentials.webhook }, noHttp, wait),
    { stage: 'configuration_rejected' },
  );
  assert.deepEqual(
    await runLive(
      input(),
      { ...config, evolutionUrl: 'http://evolution.invalid' },
      credentials,
      noHttp,
      wait,
    ),
    { stage: 'configuration_rejected' },
  );
});
test('exact Finance envelope, credentials, timeout, redirects and verbatim Evolution text', async () => {
  const calls = [];
  const result = await runLive(
    input(),
    config,
    credentials,
    async (request) => {
      calls.push(request);
      return response;
    },
    wait,
  );
  assert.equal(result.stage, 'sent');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://finance-lab-api:3000/api/v1/inbox/messages');
  assert.deepEqual(
    Object.keys(calls[0].body).sort(),
    [
      'source',
      'source_instance',
      'source_message_id',
      'sender_reference',
      'received_at',
      'raw_text',
      'message_context',
    ].sort(),
  );
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${credentials.finance}` });
  assert.deepEqual(calls[1].headers, { apikey: credentials.evolution });
  assert.equal(calls[1].url, 'https://evolution.invalid/message/sendText/synthetic-lab');
  assert.deepEqual(calls[1].body, { number: '5511999999999', text: replyText, linkPreview: false });
  for (const call of calls) {
    assert.equal(call.timeout, 10000);
    assert.equal(call.disableFollowRedirect, true);
  }
  assert.equal(JSON.stringify(result).includes(credentials.finance), false);
});
for (const status of [400, 401, 403, 409, 422, 302])
  test(`Finance ${status} never sends or retries`, async () => {
    let calls = 0;
    const result = await runLive(
      input(),
      config,
      credentials,
      async () => {
        calls++;
        return { statusCode: status };
      },
      wait,
    );
    assert.equal(calls, 1);
    assert.equal(result.stage, 'finance_failed');
    assert.equal(result.status, status);
  });
test('Finance retry keeps identity and send retry never reingests', async () => {
  const calls = [],
    delays = [];
  const statuses = [503, 200, 500, 200];
  const result = await runLive(
    input(),
    config,
    credentials,
    async (request) => {
      calls.push(request);
      return { ...response, statusCode: statuses.shift() };
    },
    async (ms) => delays.push(ms),
  );
  assert.equal(result.stage, 'sent');
  assert.deepEqual(delays, [1000, 1000]);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[2], calls[3]);
});
test('429 uses Retry-After and limits attempts', async () => {
  const delays = [];
  let calls = 0;
  const result = await runLive(
    input(),
    config,
    credentials,
    async () => {
      calls++;
      return { statusCode: 429, headers: { 'retry-after': '2' } };
    },
    async (ms) => delays.push(ms),
  );
  assert.equal(result.stage, 'finance_failed');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 2000]);
});
test('timeout is bounded; raw errors and secrets never escape', async () => {
  let calls = 0;
  const result = await runLive(
    input(),
    config,
    credentials,
    async () => {
      calls++;
      throw Object.assign(new Error(credentials.finance), { code: 'ECONNABORTED' });
    },
    wait,
  );
  assert.equal(calls, 3);
  assert.deepEqual(result, { stage: 'finance_failed', status: 'timeout' });
});
test('duplicate returns no reply', async () => {
  let calls = 0;
  const result = await runLive(
    input(),
    config,
    credentials,
    async () => {
      calls++;
      return {
        statusCode: 200,
        body: { data: { result: { type: 'duplicate_message' }, reply: { should_send: false } } },
      };
    },
    wait,
  );
  assert.equal(result.stage, 'accepted_no_reply');
  assert.equal(calls, 1);
});
test('send 401/403 never reingests and ambiguous send timeout is explicit', async () => {
  for (const status of [401, 403, 'timeout']) {
    let finance = 0,
      sends = 0;
    const result = await runLive(
      input(),
      config,
      credentials,
      async (req) => {
        if (req.url.includes('/inbox/')) {
          finance++;
          return response;
        }
        sends++;
        if (status === 'timeout')
          throw Object.assign(new Error('synthetic'), { code: 'ETIMEDOUT' });
        return { statusCode: status };
      },
      wait,
    );
    assert.equal(finance, 1);
    assert.equal(sends, status === 'timeout' ? 3 : 1);
    assert.equal(result.stage, 'send_failed');
    assert.equal(result.possiblyDelivered, status === 'timeout');
  }
});
test('generated workflow requires auth, disabled release, no saved executions or credentials', () => {
  const workflow = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url)));
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes[0].parameters.authentication, 'headerAuth');
  assert.equal(workflow.nodes[1].parameters.enabled, false);
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  for (const node of workflow.nodes) assert.equal(node.credentials, undefined);
});
test('packaged n8n node executes actual bundled P03 and provider adapter', async () => {
  const require = createRequire(import.meta.url);
  const { FinanceLabTransport } = require('./dist/FinanceLabTransport.node.js');
  const node = new FinanceLabTransport();
  const actual = await node.execute.call({
    getNodeParameter: (name) => config[name],
    getInputData: () => [{ json: input() }],
    getCredentials: async (name) =>
      name === 'httpHeaderAuth'
        ? { name: 'x-finance-webhook', value: credentials.webhook }
        : { token: name === 'financeLabIngest' ? credentials.finance : credentials.evolution },
    helpers: { httpRequest: async () => response },
  });
  assert.equal(actual[0][0].json.stage, 'sent');
});

test('packaged n8n transport forwards M08 query_summary to Evolution', async () => {
  const require = createRequire(import.meta.url);
  const { FinanceLabTransport } = require('./dist/FinanceLabTransport.node.js');
  const summary = [
    'Resumo Empresa (01/11/2026 a 30/11/2026)',
    'Receitas ordinárias: R$ 2.500,00',
    'Despesas brutas: R$ 35,00',
    'Estornos: R$ 0,00',
    'Despesas líquidas: R$ 35,00',
    'Resultado líquido: R$ 2.465,00',
  ].join('\n');
  const calls = [];
  const result = await new FinanceLabTransport().execute.call({
    getNodeParameter: (name) => config[name],
    getInputData: () => [{ json: input() }],
    getCredentials: async (name) =>
      name === 'httpHeaderAuth'
        ? { name: 'x-finance-webhook', value: credentials.webhook }
        : { token: name === 'financeLabIngest' ? credentials.finance : credentials.evolution },
    helpers: {
      httpRequest: async (request) => {
        calls.push(request);
        return calls.length === 1
          ? {
              statusCode: 200,
              body: {
                data: {
                  result: { type: 'query_summary' },
                  reply: {
                    should_send: true,
                    text: summary,
                    contract: { version: 'm06-p03-v1', max_code_points: 500 },
                  },
                },
              },
            }
          : { statusCode: 200 };
      },
    },
  });
  assert.equal(result[0][0].json.stage, 'sent');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, {
    number: '5511999999999',
    text: summary,
    linkPreview: false,
  });
});

test('packaged n8n transport sends M07 mutation completion replies', async () => {
  const require = createRequire(import.meta.url);
  const { FinanceLabTransport } = require('./dist/FinanceLabTransport.node.js');
  for (const [action, text] of [
    ['correction', 'Lançamento corrigido: R$ 38,90.\nRef: ABC123'],
    ['void', 'Lançamento cancelado: R$ 35,00.\nRef: ABC123'],
    ['refund', 'Lançamento estornado: R$ 20,00.\nRef: ABC123'],
  ]) {
    const calls = [];
    const result = await new FinanceLabTransport().execute.call({
      getNodeParameter: (name) => config[name],
      getInputData: () => [{ json: input() }],
      getCredentials: async (name) =>
        name === 'httpHeaderAuth'
          ? { name: 'x-finance-webhook', value: credentials.webhook }
          : { token: name === 'financeLabIngest' ? credentials.finance : credentials.evolution },
      helpers: {
        httpRequest: async (request) => {
          calls.push(request);
          return calls.length === 1
            ? {
                statusCode: 200,
                body: {
                  data: {
                    result: { type: 'transaction_mutated', action },
                    reply: {
                      should_send: true,
                      text,
                      contract: { version: 'm06-p03-v1', max_code_points: 500 },
                    },
                  },
                },
              }
            : { statusCode: 200 };
        },
      },
    });
    assert.equal(result[0][0].json.stage, 'sent');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, {
      number: '5511999999999',
      text,
      linkPreview: false,
    });
  }
});
