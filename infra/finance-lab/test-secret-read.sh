#!/usr/bin/env bash
set -euo pipefail

uid=$(id -u)
gid=$(id -g)
if [ "$uid" -eq 0 ]; then
  echo 'Run the secret-mount check as a non-root operator.' >&2
  exit 1
fi

test_dir=$(mktemp -d)
cleanup() {
  docker compose -f "$test_dir/compose.yml" down >/dev/null 2>&1 || true
  rm -rf -- "$test_dir"
}
trap cleanup EXIT
chmod 700 "$test_dir"
printf 'disposable-marker' > "$test_dir/marker"
chmod 600 "$test_dir/marker"
test "$(stat -c %u "$test_dir/marker")" = "$uid"
test "$(stat -c %a "$test_dir/marker")" = 600

cat > "$test_dir/compose.yml" <<'YAML'
services:
  readcheck:
    image: finance-hub-api:lab
    user: '${FINANCE_LAB_UID}:${FINANCE_LAB_GID}'
    entrypoint:
      - node
      - -e
      - "const fs = require('node:fs'); const p = '/run/secrets/marker'; if (process.getuid() === 0 || fs.statSync(p).uid !== process.getuid() || fs.readFileSync(p, 'utf8') !== 'disposable-marker') process.exit(1);"
    secrets: [marker]
secrets:
  marker:
    file: '${SECRET_FILE}'
YAML

export FINANCE_LAB_UID="$uid" FINANCE_LAB_GID="$gid" SECRET_FILE="$test_dir/marker"
docker compose -f "$test_dir/compose.yml" run --rm readcheck >/dev/null
if FINANCE_LAB_UID="$((uid + 1))" docker compose -f "$test_dir/compose.yml" run --rm readcheck >/dev/null 2>&1; then
  echo 'FAIL: a different non-root UID read the 0600 secret.' >&2
  exit 1
fi
if docker run --rm --user 0 finance-hub-api:lab api >/dev/null 2>&1; then
  echo 'FAIL: the Lab runtime accepted root.' >&2
  exit 1
fi
echo 'PASS: owner UID read a 0600 Compose secret; another UID and root were rejected.'
