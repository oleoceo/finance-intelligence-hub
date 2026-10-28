#!/usr/bin/env bash
set -euo pipefail

uid=$(id -u)
gid=$(id -g)
if [ "$uid" -eq 0 ]; then
  echo 'Run the secret-mount check as a non-root operator.' >&2
  exit 1
fi

if [ "${FINANCE_LAB_FORCE_SUDO_DOCKER:-0}" != 1 ] && docker info >/dev/null 2>&1; then
  docker_cli() { docker "$@"; }
else
  # sudo receives only numeric identity and a disposable file path; never credential values.
  sudo docker info >/dev/null
  docker_cli() {
    sudo env FINANCE_LAB_UID="$FINANCE_LAB_UID" FINANCE_LAB_GID="$FINANCE_LAB_GID" SECRET_FILE="$SECRET_FILE" docker "$@"
  }
fi

test_dir=$(mktemp -d)
export FINANCE_LAB_UID="$uid" FINANCE_LAB_GID="$gid" SECRET_FILE="$test_dir/marker"
cleanup() {
  docker_cli compose -f "$test_dir/compose.yml" down >/dev/null 2>&1 || true
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

docker_cli compose -f "$test_dir/compose.yml" run --rm readcheck >/dev/null
if FINANCE_LAB_UID="$((uid + 1))" docker_cli compose -f "$test_dir/compose.yml" run --rm readcheck >/dev/null 2>&1; then
  echo 'FAIL: a different non-root UID read the 0600 secret.' >&2
  exit 1
fi
if docker_cli run --rm --user 0 finance-hub-api:lab api >"$test_dir/root.stdout" 2>"$test_dir/root.stderr"; then
  echo 'FAIL: the Lab runtime accepted root.' >&2
  exit 1
fi
if [[ $(<"$test_dir/root.stderr") != *'Error: Finance Lab runtime must be non-root'* ]]; then
  echo 'FAIL: root exited for a reason other than the explicit runtime guard.' >&2
  exit 1
fi
echo 'PASS: owner UID read a 0600 Compose secret; another UID and root were rejected.'
