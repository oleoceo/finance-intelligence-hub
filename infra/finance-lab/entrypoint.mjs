import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function secret(name) {
  const value = readFileSync(`/run/secrets/${name}`, 'utf8').trimEnd();
  if (!value) throw new Error(`Empty secret: ${name}`);
  return value;
}

const mode = process.argv[2];
if (!['api', 'migrate:up', 'migrate:status'].includes(mode)) {
  throw new Error('Expected api, migrate:up or migrate:status');
}

const user = mode === 'api' ? 'finance_hub_app' : 'finance_hub_migrations';
const password = secret(mode === 'api' ? 'app_password' : 'migrations_password');
const url = new URL('postgresql://postgres-products:5432/finance_hub_lab');
url.username = user;
url.password = password;
process.env.DATABASE_URL = url.toString();

if (mode === 'api') {
  process.env.FINANCE_ADMIN_TOKEN = secret('admin_token');
  process.env.FINANCE_INGEST_TOKEN = secret('ingest_token');
}
const script =
  mode === 'api'
    ? '/app/apps/api/dist/index.js'
    : `/app/packages/database/dist/src/cli/${mode === 'migrate:up' ? 'migrate-up' : 'migrate-status'}.js`;
const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
