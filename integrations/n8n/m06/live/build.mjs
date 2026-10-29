import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const strip = (s) => s.replace(/^import .*;\r?\n/gmu, '').replaceAll('export ', '');
const out = new URL('./dist/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('package.json', out), JSON.stringify({ type: 'commonjs' }));
const bundle = `const { timingSafeEqual } = require('node:crypto');\n${strip(read('../p02/processor.mjs'))}\n${strip(read('../p03/processor.mjs'))}\n${strip(read('./adapter.mjs'))}\n${read('./node-source.cjs')}`;
writeFileSync(new URL('FinanceLabTransport.node.js', out), bundle);
for (const [suffix, name, displayName] of [
  ['Ingest', 'financeLabIngest', 'Finance Lab Ingest Only'],
  ['Evolution', 'financeLabEvolution', 'Evolution Lab Instance Token'],
]) {
  writeFileSync(
    new URL(`FinanceLab${suffix}.credentials.js`, out),
    `class FinanceLab${suffix} {
    constructor() { this.name = '${name}'; this.displayName = '${displayName}';
      this.properties = [{ displayName: 'Token', name: 'token', type: 'string', default: '', typeOptions: { password: true }, required: true }]; }
  } module.exports = { FinanceLab${suffix} };`,
  );
}
// Preserve P03 as the accepted algorithm; replace only its unbound execution shell.
const workflow = JSON.parse(read('../p03/workflow.json'));
workflow.name = 'M06 Lab — Evolution 2.3.7 (INACTIVE)';
workflow.nodes[0] = {
  ...workflow.nodes[0],
  name: 'Authenticated Lab webhook',
  parameters: {
    httpMethod: 'POST',
    path: 'finance-m06-lab',
    authentication: 'headerAuth',
    responseMode: 'lastNode',
    options: {},
  },
};
workflow.nodes[1] = {
  id: 'transport',
  name: 'Finance Lab Transport',
  type: 'CUSTOM.financeLabTransport',
  typeVersion: 1,
  position: [280, 0],
  parameters: { enabled: false, instance: '', instanceId: '', ownerJid: '', evolutionUrl: '' },
};
workflow.connections = {
  'Authenticated Lab webhook': {
    main: [[{ node: 'Finance Lab Transport', type: 'main', index: 0 }]],
  },
};
workflow.settings = {
  executionOrder: 'v1',
  saveDataErrorExecution: 'none',
  saveDataSuccessExecution: 'none',
  saveManualExecutions: false,
  saveExecutionProgress: false,
  executionTimeout: 240,
};
writeFileSync(
  new URL('./workflow.json', import.meta.url),
  await prettier.format(JSON.stringify(workflow), {
    ...(await prettier.resolveConfig(fileURLToPath(new URL('./workflow.json', import.meta.url)))),
    parser: 'json',
  }),
);
