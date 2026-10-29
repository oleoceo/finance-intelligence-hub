import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
try {
  const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const after = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const service = process.argv[4] ?? 'n8n';
  assert.ok(before.services[service], 'Use the service key from the real Compose label');
  assert.equal(before.services[service].networks['finance-products-db'], undefined);
  assert.equal(after.services[service].networks['finance-products-db'], undefined);
  assert.ok(after.services[service].networks['finance-hub-transport']);
  assert.equal(after.networks['finance-hub-transport'].external, true);
  assert.equal(after.networks['finance-hub-transport'].name, 'finance-hub-transport');
  // Remove exactly the allowed additions; everything else (including volumes) must be identical.
  delete after.services[service].networks['finance-hub-transport'];
  delete after.networks['finance-hub-transport'];
  assert.deepEqual(after, before);
  console.log(
    'n8n patch: only external transport added; existing services, networks, volumes and ports unchanged PASS',
  );
} catch {
  // Rendered Compose can contain credentials. Never print assertion diffs or parsed config.
  console.error('N8N_NETWORK_PATCH_REJECTED: inspect configuration privately; no changes applied');
  process.exitCode = 1;
}
