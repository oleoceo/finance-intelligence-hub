#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance lab offsite: FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 2 ]] || fail 'usage: finance-hub-lab-offsite.sh protect|recover ARTIFACT_OR_STAGING_DIRECTORY'
mode=$1
input=$2
[[ $mode == protect || $mode == recover ]] || fail 'invalid mode'
[[ -d $input && ! -L $input ]] || fail 'input must be a real directory'
[[ -n ${FINANCE_RESTIC_REPOSITORY:-} && -d $FINANCE_RESTIC_REPOSITORY && ! -L $FINANCE_RESTIC_REPOSITORY ]] || fail 'new local repository directory required'
[[ -n ${FINANCE_RCLONE_REMOTE:-} && $FINANCE_RCLONE_REMOTE =~ ^finance-drive:FinanceHub-Backups/finance-lab-p05/[a-zA-Z0-9_-]+$ ]] || fail 'remote is not allowlisted'
[[ -n ${RESTIC_PASSWORD_FILE:-} && -f $RESTIC_PASSWORD_FILE && ! -L $RESTIC_PASSWORD_FILE && $(stat -c %a "$RESTIC_PASSWORD_FILE") == 600 ]] || fail 'restricted password file required'
[[ -n ${RCLONE_CONFIG_FILE:-} && -f $RCLONE_CONFIG_FILE && ! -L $RCLONE_CONFIG_FILE && $(stat -c %a "$RCLONE_CONFIG_FILE") == 600 ]] || fail 'restricted rclone config file required'
[[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_COMMAND:-} && -z ${RCLONE_CONFIG:-} ]] || fail 'inline secrets forbidden'
for command in restic rclone python3 sha256sum pg_restore; do command -v "$command" >/dev/null || fail 'required tool unavailable'; done
input=$(realpath -e -- "$input")
repository=$(realpath -e -- "$FINANCE_RESTIC_REPOSITORY")
password=$(realpath -e -- "$RESTIC_PASSWORD_FILE")
config=$(realpath -e -- "$RCLONE_CONFIG_FILE")
[[ $repository != "$input" && $repository != "$input/"* && $input != "$repository/"* ]] || fail 'input and repository overlap'
for secret in "$password" "$config"; do
  [[ $secret != "$input/"* && $secret != "$repository/"* ]] || fail 'secret inside copied tree'
done
export RESTIC_REPOSITORY="$repository"
export RCLONE_CONFIG="$config"
verify_artifact() {
  local artifact=$1 expected
  [[ -d $artifact && ! -L $artifact && -f $artifact/archive.dump && ! -L $artifact/archive.dump && -f $artifact/manifest.json && ! -L $artifact/manifest.json ]] || fail 'incomplete artifact'
  [[ $(find "$artifact" -mindepth 1 -maxdepth 1 | wc -l) -eq 2 ]] || fail 'unexpected artifact contents'
  [[ $(head -c 5 "$artifact/archive.dump") == PGDMP ]] || fail 'invalid custom dump'
  expected=$(python3 - "$artifact/manifest.json" <<'PY'
import json,re,sys
try:
    m=json.load(open(sys.argv[1]))
    assert m['format']=='pg_dump-custom' and m['environment']=='lab' and m['database']=='finance_hub_lab'
    assert type(m['bytes']) is int and m['bytes']>5 and re.fullmatch('[a-f0-9]{64}',m['sha256'])
    print(m['bytes'],m['sha256'])
except (OSError,ValueError,KeyError,AssertionError):
    sys.exit(1)
PY
  ) || fail 'unauthorized or invalid manifest'
  read -r bytes checksum <<< "$expected"
  [[ $(stat -c %s "$artifact/archive.dump") == "$bytes" && $(sha256sum "$artifact/archive.dump" | cut -d ' ' -f1) == "$checksum" ]] || fail 'artifact integrity mismatch'
  pg_restore --list "$artifact/archive.dump" >/dev/null 2>&1 || fail 'archive listing failed'
}
verify_repository_layout() {
  while IFS= read -r -d '' entry; do
    relative=${entry#"$repository"/}
    [[ ! -L $entry ]] || fail 'linked repository entry'
    if [[ -d $entry ]]; then
      [[ $relative =~ ^(data|index|keys|locks|snapshots)$ || $relative =~ ^data/[a-f0-9]{2}$ ]] || fail 'unexpected repository directory'
    elif [[ -f $entry ]]; then
      [[ $relative == config || $relative =~ ^(index|keys|locks|snapshots)/[a-f0-9]{64}$ || $relative =~ ^data/[a-f0-9]{2}/[a-f0-9]{64}$ ]] || fail 'unexpected repository file'
    else
      fail 'unexpected repository entry'
    fi
  done < <(find "$repository" -mindepth 1 -print0)
}
if [[ $mode == protect ]]; then
  [[ -n ${FINANCE_BACKUP_ROOT:-} && -d $FINANCE_BACKUP_ROOT && ! -L $FINANCE_BACKUP_ROOT ]] || fail 'authorized backup root required'
  backup_root=$(realpath -e -- "$FINANCE_BACKUP_ROOT")
  [[ $input == "$backup_root/databases/finance-hub/lab/"* && $(dirname -- "$input") == "$backup_root/databases/finance-hub/lab" ]] || fail 'artifact is outside authorized Lab layout'
  verify_artifact "$input"
  [[ ! -e $repository/config && -z $(find "$repository" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'repository must be new and empty'
  [[ -z ${FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD:-} || ${FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD:-} == yes ]] || fail 'invalid password confirmation'
  [[ ${FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD:-} == yes ]] || fail 'independent new password must be confirmed'
  start=$SECONDS
  restic init --quiet >/dev/null 2>&1 || fail 'repository initialization failed'
  restic backup --quiet --tag finance-lab-p05 -- "$input" >/dev/null 2>&1 || fail 'snapshot failed'
  restic check --quiet >/dev/null 2>&1 || fail 'repository check failed'
  verify_repository_layout
  printf 'finance lab offsite: snapshot_seconds=%s\n' "$((SECONDS-start))"
  start=$SECONDS
  rclone mkdir "$FINANCE_RCLONE_REMOTE" >/dev/null 2>&1 || fail 'remote folder unavailable'
  remote_first=$(rclone lsf "$FINANCE_RCLONE_REMOTE" --files-only --recursive 2>/dev/null | sed -n '1p') || fail 'remote listing failed'
  [[ -z $remote_first ]] || fail 'remote must be empty'
  rclone copy "$repository" "$FINANCE_RCLONE_REMOTE" --quiet >/dev/null 2>&1 || fail 'remote copy failed'
  rclone check "$repository" "$FINANCE_RCLONE_REMOTE" --quiet >/dev/null 2>&1 || fail 'remote check failed'
  printf 'finance lab offsite: transfer_seconds=%s\n' "$((SECONDS-start))"
else
  [[ -z $(find "$input" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'recovery staging must be empty'
  [[ -z $(find "$repository" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'recovery repository must be empty'
  start=$SECONDS
  rclone copy "$FINANCE_RCLONE_REMOTE" "$repository" --quiet >/dev/null 2>&1 || fail 'remote recovery failed'
  verify_repository_layout
  restic check --quiet >/dev/null 2>&1 || fail 'recovered repository check failed'
  snapshot=$(restic snapshots --json --tag finance-lab-p05 | python3 -c 'import json,sys; s=json.load(sys.stdin); assert len(s)==1; print(s[0]["id"])') || fail 'expected exactly one Finance Lab snapshot'
  restic restore "$snapshot" --target "$input" --quiet >/dev/null 2>&1 || fail 'snapshot restore failed'
  artifact=$(find "$input" -type f -name manifest.json -print)
  [[ $(printf '%s\n' "$artifact" | wc -l) == 1 ]] || fail 'expected exactly one manifest'
  verify_artifact "$(dirname -- "$artifact")"
  printf 'finance lab offsite: recovery_seconds=%s snapshot=%s\n' "$((SECONDS-start))" "$snapshot"
fi
