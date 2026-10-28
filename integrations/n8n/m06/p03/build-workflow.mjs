import { readFileSync, writeFileSync } from 'node:fs';
import prettier from 'prettier';

const p02 = readFileSync(new URL('../p02/processor.mjs', import.meta.url), 'utf8').replaceAll(
  'export ',
  '',
);
const p03 = readFileSync(new URL('./processor.mjs', import.meta.url), 'utf8')
  .replace(/^import .*\n/u, '')
  .replaceAll('export ', '');
const code = `${p02}\n${p03}\nconst waitForRetry = (delayMs) => {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 30000 || typeof setTimeout !== 'function')
    throw new Error('RETRY_DELAY_UNAVAILABLE');
  return new Promise((resolve) => setTimeout(resolve, delayMs));
};
// Inactive until Gate 0 supplies out-of-band origin verification and separate credentials.
const integration = {
  verify: async () => null,
  configuredInstance: '',
  financeTransport: async () => { throw new Error('FINANCE_TRANSPORT_NOT_CONFIGURED'); },
  sendTransport: async () => { throw new Error('SEND_TRANSPORT_NOT_CONFIGURED'); },
};
const result = await processEventWithReply($input.first().json.body, {
  verify: integration.verify,
  configuredInstance: integration.configuredInstance,
  finance: (envelope) => integration.financeTransport({
    method: 'POST', path: '/api/v1/inbox/messages', credentialRef: 'finance:ingest', body: envelope,
  }),
  send: (message) => integration.sendTransport({
    credentialRef: 'evolution:send', message,
  }),
  wait: waitForRetry,
  now: integration.now ?? Date.now,
});
return [{ json: result }];`;
const workflow = {
  name: 'M06-P03 local reply template — verification and send binding required',
  active: false,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'finance-m06-p03-local-template',
        responseMode: 'lastNode',
        options: {},
      },
      id: 'ingress',
      name: 'Synthetic webhook entry',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
    },
    {
      parameters: { jsCode: code },
      id: 'gate',
      name: 'Fail-closed verification, ingest and reply dispatch',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 0],
    },
  ],
  connections: {
    'Synthetic webhook entry': {
      main: [
        [{ node: 'Fail-closed verification, ingest and reply dispatch', type: 'main', index: 0 }],
      ],
    },
  },
  settings: { executionOrder: 'v1' },
};
writeFileSync(
  new URL('./workflow.json', import.meta.url),
  await prettier.format(JSON.stringify(workflow), { parser: 'json' }),
);
