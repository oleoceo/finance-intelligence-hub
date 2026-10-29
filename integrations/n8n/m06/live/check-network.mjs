import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const compose = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.deepEqual(Object.keys(compose.services.api.networks).sort(), [
  'finance-hub-transport',
  'finance-products-db',
]);
assert.deepEqual(compose.services.api.networks['finance-hub-transport'].aliases, [
  'finance-lab-api',
]);
assert.deepEqual(Object.keys(compose.services.migrate.networks), ['finance-products-db']);
assert.equal(compose.networks['finance-hub-transport'].external, true);
assert.equal(compose.networks['finance-hub-transport'].name, 'finance-hub-transport');
for (const service of Object.values(compose.services)) assert.equal(service.ports, undefined);
console.log(
  'Transport overlay: API isolated database route, migration isolation, external transport and no ports PASS',
);
