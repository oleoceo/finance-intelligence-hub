import { readFileSync, writeFileSync } from 'node:fs';
import prettier from 'prettier';

const source = readFileSync(new URL('./processor.mjs', import.meta.url), 'utf8').replaceAll(
  'export ',
  '',
);
const code = `${source}\n// Gate 0 must bind this integration only after independent origin and sender verification.\n// The default is inert; a webhook field cannot configure or replace this binding.\nconst integration = {\n  verify: async () => null,\n  configuredInstance: '',\n  financeTransport: async () => { throw new Error('FINANCE_TRANSPORT_NOT_CONFIGURED'); },\n};\nconst result = await processEvent($input.first().json.body, {\n  verify: integration.verify,\n  configuredInstance: integration.configuredInstance,\n  finance: (envelope) => integration.financeTransport({\n    method: 'POST',\n    path: '/api/v1/inbox/messages',\n    credentialRef: 'finance:ingest',\n    body: envelope,\n  }),\n});\nreturn [{ json: result }];`;
const workflow = {
  name: 'M06-P02 local template — verification required',
  active: false,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'finance-m06-local-template',
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
      name: 'Fail-closed verification and ingest boundary',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 0],
    },
  ],
  connections: {
    'Synthetic webhook entry': {
      main: [[{ node: 'Fail-closed verification and ingest boundary', type: 'main', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1' },
};
writeFileSync(
  new URL('./workflow.json', import.meta.url),
  await prettier.format(JSON.stringify(workflow), { parser: 'json' }),
);
