#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
cat > "$fixture/base.yml" <<'YAML'
services:
  n8n:
    image: n8nio/n8n:2.23.3
    networks: [n8n_internal, proxy]
    volumes: [n8n_data:/home/node/.n8n]
  unrelated:
    image: busybox:latest
    networks: [n8n_internal]
    volumes: [unrelated_data:/data]
networks:
  n8n_internal: {}
  proxy:
    external: true
volumes:
  n8n_data: {}
  unrelated_data: {}
YAML
docker compose -p synthetic-n8n -f "$fixture/base.yml" config --format json > "$fixture/before.json"
docker compose -p synthetic-n8n -f "$fixture/base.yml" -f "$PWD/infra/finance-lab/n8n.transport.compose.yml" config --format json > "$fixture/after.json"
node integrations/n8n/m06/live/check-n8n-network.mjs "$fixture/before.json" "$fixture/after.json"
# An unrelated volume change must fail without dumping private rendered configuration.
sed 's/n8n_data/unapproved_private_volume/g' "$fixture/after.json" > "$fixture/invalid.json"
if node integrations/n8n/m06/live/check-n8n-network.mjs "$fixture/before.json" "$fixture/invalid.json" > "$fixture/rejected.txt" 2>&1; then
  echo 'FAIL: unrelated volume mutation accepted' >&2
  exit 1
fi
test "$(cat "$fixture/rejected.txt")" = 'N8N_NETWORK_PATCH_REJECTED: inspect configuration privately; no changes applied'
echo 'n8n patch: unrelated mutation rejected without config disclosure PASS'
