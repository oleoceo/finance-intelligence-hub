#!/usr/bin/env bash
set -Eeuo pipefail

# M09-P02: disposable local/CI repository and destination only.
umask 077
fail() { printf 'finance protection: FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 1 ]] || fail 'usage: finance-hub-protect.sh ARTIFACT_DIRECTORY'
artifact=$1
[[ -d $artifact && ! -L $artifact && $(basename -- "$artifact") != .staging.* ]] || fail 'invalid artifact directory'
[[ -f $artifact/archive.dump && ! -L $artifact/archive.dump && -f $artifact/manifest.json && ! -L $artifact/manifest.json ]] || fail 'incomplete artifact'
[[ -n ${FINANCE_RESTIC_REPOSITORY:-} && -d $FINANCE_RESTIC_REPOSITORY && ! -L $FINANCE_RESTIC_REPOSITORY ]] || fail 'local repository directory is required'
[[ -n ${FINANCE_RCLONE_DESTINATION:-} && -d $FINANCE_RCLONE_DESTINATION && ! -L $FINANCE_RCLONE_DESTINATION ]] || fail 'local test destination is required'
[[ -n ${RESTIC_PASSWORD_FILE:-} && -f $RESTIC_PASSWORD_FILE && ! -L $RESTIC_PASSWORD_FILE && $(stat -c %a "$RESTIC_PASSWORD_FILE") == 600 ]] || fail 'external Restic password file is required with mode 600'
[[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_COMMAND:-} ]] || fail 'inline Restic password is forbidden'
[[ -z ${RCLONE_CONFIG:-} ]] || fail 'inline rclone configuration is forbidden'
command -v restic >/dev/null || fail 'Restic is unavailable'
command -v rclone >/dev/null || fail 'rclone is unavailable'
command -v node >/dev/null || fail 'Node is unavailable'

artifact=$(cd -- "$artifact" && pwd -P)
repository=$(cd -- "$FINANCE_RESTIC_REPOSITORY" && pwd -P)
destination=$(cd -- "$FINANCE_RCLONE_DESTINATION" && pwd -P)
[[ $artifact != "$repository" && $artifact != "$repository/"* && $artifact != "$destination" && $artifact != "$destination/"* && $repository != "$destination" && $repository != "$destination/"* && $destination != "$repository/"* ]] || fail 'paths must be isolated'
[[ -s $artifact/archive.dump && $(head -c 5 "$artifact/archive.dump") == PGDMP ]] || fail 'invalid dump format'
expected=$(node -e '
const fs = require("node:fs");
try {
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (m.format !== "pg_dump-custom" || !["local", "lab"].includes(m.environment) ||
      !/^[a-z][a-z0-9_]*$/.test(m.database) ||
      !/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(m.created_at_utc) ||
      !Number.isSafeInteger(m.bytes) || m.bytes <= 5 ||
      !/^[a-f0-9]{64}$/.test(m.sha256)) process.exit(1);
  process.stdout.write(`${m.bytes} ${m.sha256}`);
} catch { process.exit(1); }
' "$artifact/manifest.json") || fail 'invalid manifest'
read -r bytes checksum <<< "$expected"
[[ $(stat -c %s "$artifact/archive.dump") == "$bytes" && $(sha256sum "$artifact/archive.dump" | cut -d ' ' -f1) == "$checksum" ]] || fail 'artifact checksum mismatch'
[[ $(find "$artifact" -mindepth 1 -maxdepth 1 | wc -l) -eq 2 ]] || fail 'unexpected artifact contents'

export RESTIC_REPOSITORY="$repository"
if [[ ! -f $repository/config ]]; then
  [[ -z $(find "$repository" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'repository is not empty or initialized'
  restic init --quiet >/dev/null 2>&1 || fail 'repository initialization failed'
fi
restic snapshots --json >/dev/null 2>&1 || fail 'repository password or configuration is invalid'
restic backup --quiet --tag finance-hub -- "$artifact" >/dev/null 2>&1 || fail 'snapshot creation failed'
restic check --quiet >/dev/null 2>&1 || fail 'local repository integrity check failed'
printf 'finance protection: LOCAL_SNAPSHOT_COMPLETE\n'

# copy never removes unrelated remote objects; check proves byte equality before success.
if ! rclone copy "$repository" "$destination" --quiet >/dev/null 2>&1 ||
   ! rclone check "$repository" "$destination" --one-way --quiet >/dev/null 2>&1; then
  printf 'finance protection: REMOTE_INCOMPLETE; local snapshot retained\n' >&2
  exit 2
fi
printf 'finance protection: OFFSITE_COMPLETE\n'
