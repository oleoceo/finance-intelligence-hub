#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# M09-P03 is restricted to explicitly owned disposable local/CI fixtures.
log() { printf 'finance schedule: %s\n' "$1"; }
fail() { log "FAILED $1" >&2; exit 1; }
[[ $# -eq 1 && ( $1 == daily || $1 == weekly-check ) ]] || fail 'expected daily or weekly-check'
mode=$1
[[ ${FINANCE_BACKUP_FIXTURE_ONLY:-} == yes ]] || fail 'disposable fixture authorization required'
[[ -n ${FINANCE_BACKUP_ROOT:-} && -d $FINANCE_BACKUP_ROOT && ! -L $FINANCE_BACKUP_ROOT ]] || fail 'invalid root'
root=$(cd -- "$FINANCE_BACKUP_ROOT" && pwd -P)
[[ -f $root/.finance-backup-test-fixture && ! -L $root/.finance-backup-test-fixture ]] || fail 'missing fixture marker'
[[ $root == /tmp/* || $root == /home/* || $root == /mnt/*/Users/*/AppData/Local/Temp/* ]] || fail 'unexpected root'
[[ -n ${FINANCE_BACKUP_ALLOWED_DATABASE:-} && $FINANCE_BACKUP_ALLOWED_DATABASE != finance_hub_prod ]] || fail 'invalid database'
[[ -n ${FINANCE_RESTIC_REPOSITORY:-} && -d $FINANCE_RESTIC_REPOSITORY && ! -L $FINANCE_RESTIC_REPOSITORY ]] || fail 'invalid repository'
[[ -n ${FINANCE_RCLONE_DESTINATION:-} && -d $FINANCE_RCLONE_DESTINATION && ! -L $FINANCE_RCLONE_DESTINATION ]] || fail 'invalid destination'
repository=$(cd -- "$FINANCE_RESTIC_REPOSITORY" && pwd -P)
destination=$(cd -- "$FINANCE_RCLONE_DESTINATION" && pwd -P)
[[ $repository == "$root"/* && $destination == "$root"/* && $repository != "$destination" && $repository != "$destination"/* && $destination != "$repository"/* ]] || fail 'destinations outside fixture or overlapping'
[[ -n ${RESTIC_PASSWORD_FILE:-} && -f $RESTIC_PASSWORD_FILE && ! -L $RESTIC_PASSWORD_FILE && $(stat -c %a "$RESTIC_PASSWORD_FILE") == 600 ]] || fail 'invalid password file'
[[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_COMMAND:-} && -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
password_file=$(realpath -e -- "$RESTIC_PASSWORD_FILE")
[[ $password_file == "$root"/* && $password_file != "$repository"/* && $password_file != "$destination"/* ]] || fail 'password path outside fixture or copied tree'
target=$root/databases/finance-hub/local
[[ -d $target && ! -L $target && $(stat -c %a "$target") == 700 ]] || fail 'invalid artifact directory'
export RESTIC_REPOSITORY="$repository"
control_file_safe() {
  local path=$1
  [[ ! -L $path ]] || return 1
  [[ ! -e $path ]] || [[ -f $path && $(stat -c %h -- "$path") == 1 && $(stat -c %u -- "$path") == "$(id -u)" ]]
}
write_control_file() {
  local path=$1 value=$2 temporary
  control_file_safe "$path" || return 1
  temporary=$(mktemp "$root/.finance-control.XXXXXXXX") || return 1
  printf '%s\n' "$value" > "$temporary" || { rm -f -- "$temporary"; return 1; }
  control_file_safe "$path" || { rm -f -- "$temporary"; return 1; }
  mv -T -- "$temporary" "$path"
}
lock=$root/.finance-backup.lock
for control in "$lock" "$root/.finance-last-failure" "$root/.finance-offsite-success.tmp" "$root/.finance-offsite-success"; do
  control_file_safe "$control" || fail 'unsafe control file'
done
# Append mode cannot truncate a raced target; no bytes are written to the lock.
exec 9>>"$lock"
control_file_safe "$lock" || fail 'unsafe lock'
[[ $(stat -Lc %d:%i -- /proc/self/fd/9) == "$(stat -c %d:%i -- "$lock")" ]] || fail 'lock changed during open'
flock -n 9 || fail 'LOCKED'
trap 'rc=$?; if (( rc != 0 )); then write_control_file "$root/.finance-last-failure" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || log "FAILED unsafe failure marker" >&2; fi' EXIT
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log "STARTED mode=$mode at=$started environment=local database=$FINANCE_BACKUP_ALLOWED_DATABASE"
trap 'log "INTERRUPTED" >&2; exit 143' TERM
trap 'log "INTERRUPTED" >&2; exit 130' INT

if [[ $mode == weekly-check ]]; then
  restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'
  log 'INTEGRITY_CHECK_COMPLETE'
  exit 0
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
dump_output=$(bash "$script_dir/finance-hub-dump.sh" local "$FINANCE_BACKUP_ALLOWED_DATABASE") || fail 'DUMP_FAILED'
name=${dump_output##* }
[[ $name =~ ^finance-hub_local_[a-z0-9_]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_[0-9]+_[a-f0-9]{8}$ && -d $target/$name && ! -L $target/$name ]] || fail 'invalid published artifact'
artifact=$target/$name
log 'LOCAL_BACKUP_COMPLETE'
if ! protection_output=$(bash "$script_dir/finance-hub-protect.sh" "$artifact" 2>&1); then
  if [[ $protection_output == *REMOTE_INCOMPLETE* ]]; then fail 'REMOTE_INCOMPLETE'; fi
  fail 'PROTECTION_FAILED'
fi
[[ $protection_output == *LOCAL_SNAPSHOT_COMPLETE* && $protection_output == *OFFSITE_COMPLETE* ]] || fail 'PROTECTION_INCOMPLETE'
log 'OFFSITE_COMPLETE'

# A failed integrity check cannot authorize any deletion.
restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'
snapshots=$(restic snapshots --json 2>/dev/null) || fail 'SNAPSHOT_LIST_FAILED'
SNAPSHOTS_JSON="$snapshots" node -e '
const list = JSON.parse(process.env.SNAPSHOTS_JSON);
if (!Array.isArray(list) || !list.length || list.some(s => !Array.isArray(s.tags) || !s.tags.includes("finance-hub") ||
    !Array.isArray(s.paths) || s.paths.length !== 1 || !s.paths[0].startsWith(process.env.FINANCE_BACKUP_ROOT + "/databases/finance-hub/local/"))) process.exit(1);
' || fail 'unowned snapshot; retention refused'
restic forget --tag finance-hub --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune --quiet >/dev/null 2>&1 || fail 'RETENTION_FAILED'
restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'

# Retention alters encrypted repository objects. Sync and compare the complete
# disposable destination before reporting off-site protection for this run.
for tree in "$repository" "$destination"; do
  while IFS= read -r -d '' entry; do
    relative=${entry#"$tree"/}
    [[ ! -L $entry ]] || fail 'unexpected encrypted repository entry'
    if [[ -d $entry ]]; then
      [[ $relative =~ ^(data|index|keys|locks|snapshots)$ || $relative =~ ^data/[a-f0-9]{2}$ ]] || fail 'unexpected encrypted repository entry'
    elif [[ -f $entry ]]; then
      [[ $relative == config || $relative =~ ^(index|keys|locks|snapshots)/[a-f0-9]{64}$ || $relative =~ ^data/[a-f0-9]{2}/[a-f0-9]{64}$ ]] || fail 'unexpected encrypted repository entry'
    else
      fail 'unexpected encrypted repository entry'
    fi
  done < <(find "$tree" -mindepth 1 -print0)
done
rclone sync "$repository" "$destination" --quiet >/dev/null 2>&1 || fail 'REMOTE_INCOMPLETE'
rclone check "$repository" "$destination" --quiet >/dev/null 2>&1 || fail 'REMOTE_INCOMPLETE'
log 'OFFSITE_RETENTION_VERIFIED'
write_control_file "$root/.finance-offsite-success.tmp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || fail 'unsafe success marker'
control_file_safe "$root/.finance-offsite-success" || fail 'unsafe success marker'
mv -T -- "$root/.finance-offsite-success.tmp" "$root/.finance-offsite-success" || fail 'success marker publish failed'

# Keep three recent valid published artifacts. Reject ambiguous entries.
mapfile -t entries < <(find "$target" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)
valid=()
for entry in "${entries[@]}"; do
  [[ $entry =~ ^finance-hub_local_[a-z0-9_]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_[0-9]+_[a-f0-9]{8}$ ]] || fail 'unexpected local artifact; cleanup refused'
  path=$target/$entry
  [[ -d $path && ! -L $path && -f $path/archive.dump && ! -L $path/archive.dump && -f $path/manifest.json && ! -L $path/manifest.json ]] || fail 'invalid local artifact; cleanup refused'
  [[ $(find "$path" -mindepth 1 -maxdepth 1 | wc -l) -eq 2 ]] || fail 'unexpected artifact contents; cleanup refused'
  node -e '
    const fs=require("node:fs"),crypto=require("node:crypto"),p=process.argv[1];
    const m=JSON.parse(fs.readFileSync(p+"/manifest.json"));
    const b=fs.readFileSync(p+"/archive.dump");
    if (m.format!=="pg_dump-custom" || m.environment!=="local" || m.database!==process.env.FINANCE_BACKUP_ALLOWED_DATABASE ||
      !b.subarray(0,5).equals(Buffer.from("PGDMP")) || m.bytes!==b.length ||
      m.sha256!==crypto.createHash("sha256").update(b).digest("hex")) process.exit(1);
  ' "$path" || fail 'invalid local artifact; cleanup refused'
  valid+=("$entry")
done
if (( ${#valid[@]} > 3 )); then
  for entry in "${valid[@]:0:${#valid[@]}-3}"; do
    rm -- "$target/$entry/archive.dump" "$target/$entry/manifest.json" || fail 'LOCAL_RETENTION_FAILED'
    rmdir -- "$target/$entry" || fail 'LOCAL_RETENTION_FAILED'
  done
fi
control_file_safe "$root/.finance-last-failure" || fail 'unsafe failure marker'
rm -f -- "$root/.finance-last-failure" || fail 'failure marker cleanup failed'
log "SUCCESS finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
