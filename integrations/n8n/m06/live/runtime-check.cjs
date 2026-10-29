// Disposable n8n container only; random synthetic secrets are never printed.
const { execFileSync, fork } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const dir = mkdtempSync('/tmp/m06-check-');
const cli = (args) => {
  try {
    return execFileSync('n8n', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const diagnostic = String(error.stdout)
      .split('\n')
      .filter((line) => /Error|Unknown|Unrecognized|Cannot|runner/i.test(line))
      .join('\n')
      .replace(/[a-f0-9]{64}/gi, '[redacted]');
    throw new Error(`N8N_SYNTHETIC_CHECK_FAILED: ${diagnostic}`);
  }
};
assert.match(cli(['--version']), /2\.23\.3/);
const workflow = JSON.parse(readFileSync('/fixture/workflow.json', 'utf8'));
workflow.id = 'M06InactiveImport';
writeFileSync(`${dir}/workflow.json`, JSON.stringify(workflow));
cli(['import:workflow', `--input=${dir}/workflow.json`]);
cli(['export:workflow', '--id=M06InactiveImport', `--output=${dir}/export.json`]);
const exported = JSON.parse(readFileSync(`${dir}/export.json`, 'utf8'))[0];
assert.equal(exported.active, false);
assert.equal(exported.nodes[1].parameters.enabled, false);
assert.equal(exported.settings.saveDataErrorExecution, 'none');

const creds = [
  {
    id: 'syntheticWebhook',
    name: 'Synthetic only',
    type: 'httpHeaderAuth',
    data: { name: 'x-finance-webhook', value: randomBytes(32).toString('hex') },
  },
  {
    id: 'syntheticFinance',
    name: 'Synthetic only',
    type: 'financeLabIngest',
    data: { token: randomBytes(32).toString('hex') },
  },
  {
    id: 'syntheticEvolution',
    name: 'Synthetic only',
    type: 'financeLabEvolution',
    data: { token: randomBytes(32).toString('hex') },
  },
];
writeFileSync(`${dir}/credentials.json`, JSON.stringify(creds), { mode: 0o600 });
cli(['import:credentials', `--input=${dir}/credentials.json`]);
const transport = workflow.nodes[1];
Object.assign(transport.parameters, {
  instance: 'synthetic-lab',
  instanceId: 'synthetic-uuid',
  ownerJid: '5511000000000@s.whatsapp.net',
  evolutionUrl: 'https://evolution.invalid',
});
transport.credentials = Object.fromEntries(creds.map((c) => [c.type, { id: c.id, name: c.name }]));
workflow.nodes[0] = {
  id: 'manual',
  name: 'Manual',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};
workflow.connections = { Manual: { main: [[{ node: transport.name, type: 'main', index: 0 }]] } };
for (const enabled of [false, true]) {
  workflow.id = enabled ? 'M06RejectRuntime' : 'M06DisabledRuntime';
  transport.parameters.enabled = enabled;
  writeFileSync(`${dir}/runtime.json`, JSON.stringify(workflow));
  cli(['import:workflow', `--input=${dir}/runtime.json`]);
  const output = cli(['execute', `--id=${workflow.id}`]);
  assert.match(output, new RegExp(`"stage":\\s*"${enabled ? 'rejected' : 'disabled'}"`));
}
const fixture = {
  headers: { 'x-finance-webhook': creds[0].data.value },
  body: {
    event: 'messages.upsert',
    instance: 'synthetic-lab',
    sender: '5511000000000@s.whatsapp.net',
    data: {
      instanceId: 'synthetic-uuid',
      key: { id: 'SYNTHETIC123', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
      messageType: 'conversation',
      message: { conversation: 'último' },
      messageTimestamp: 1793275200,
    },
  },
};
workflow.id = 'M06HttpRuntime';
workflow.nodes.push({
  id: 'fixture',
  name: 'Synthetic fixture',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [100, 0],
  parameters: { mode: 'raw', jsonOutput: JSON.stringify(fixture), options: {} },
});
workflow.connections = {
  Manual: { main: [[{ node: 'Synthetic fixture', type: 'main', index: 0 }]] },
  'Synthetic fixture': { main: [[{ node: transport.name, type: 'main', index: 0 }]] },
};
writeFileSync(`${dir}/runtime.json`, JSON.stringify(workflow));
cli(['import:workflow', `--input=${dir}/runtime.json`]);
const server = fork('/fixture/mock-finance.cjs', [dir], {
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
});
server.once('message', () => {
  try {
    const output = cli(['execute', `--id=${workflow.id}`]);
    assert.match(output, /"stage":\s*"accepted_no_reply"/);
    assert.equal(JSON.parse(readFileSync(`${dir}/calls.json`, 'utf8')).calls, 2);
    console.log(
      'n8n 2.23.3: inactive import/export, credential binding, disabled/rejected execution, authenticated HTTP ingest and 503 retry PASS',
    );
  } finally {
    server.kill();
  }
});
