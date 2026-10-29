#!/usr/bin/env bash
set -euo pipefail

image="${1:-finance-hub-api:lab}"

# Resolve the compiled entry points with only the dependencies in the final image.
docker run --rm --network none --entrypoint node "$image" --input-type=module -e \
  "await Promise.all(['/app/apps/api/dist/index.js', '/app/packages/core/dist/index.js', '/app/packages/database/dist/src/index.js'].map((path) => import(path)))"

# Start the real server with synthetic credentials and no database connection.
container="$(docker run --rm -d --network none \
  -e HOST=127.0.0.1 -e PORT=3000 \
  -e FINANCE_ADMIN_TOKEN=synthetic-admin-token \
  -e FINANCE_INGEST_TOKEN=synthetic-ingest-token \
  --entrypoint node "$image" /app/apps/api/dist/index.js)"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT

for attempt in {1..30}; do
  if docker exec "$container" node -e \
    "Promise.all([fetch('http://127.0.0.1:3000/health'), fetch('http://127.0.0.1:3000/ready')]).then(async ([health, ready]) => { if (health.status !== 200 || (await health.json()).status !== 'ok' || ready.status !== 503 || (await ready.json()).status !== 'not_ready') process.exit(1) }).catch(() => process.exit(1))"; then
    echo 'Final image imports and API startup smoke test passed'
    exit 0
  fi
  sleep 1
done

docker logs "$container" >&2
echo 'Final image API startup smoke test failed' >&2
exit 1
