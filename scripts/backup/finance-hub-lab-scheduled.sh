#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
log() { printf 'finance lab schedule: %s\n' "$1"; }
fail() { log "FAILED $1" >&2; exit 1; }
[[ $# == 1 && ( $1 == daily || $1 == weekly-check || $1 == status ) ]] || fail 'invalid mode'
mode=$1
[[ ${FINANCE_LAB_SCHEDULE_ENABLED:-} == yes && ${FINANCE_BACKUP_ALLOWED_DATABASE:-} == finance_hub_lab ]] || fail 'Lab authorization required'
[[ ${PGHOST:-} == postgres-products && ${PGPORT:-} == 5432 && -n ${PGUSER:-} ]] || fail 'unauthorized PostgreSQL source'
[[ -n ${FINANCE_BACKUP_ROOT:-} && -d $FINANCE_BACKUP_ROOT && ! -L $FINANCE_BACKUP_ROOT ]] || fail 'invalid root'
root=$(realpath -e -- "$FINANCE_BACKUP_ROOT")
[[ $root == /opt/apps/backups || ( ${FINANCE_LAB_DISPOSABLE_TEST:-} == yes && $root == /tmp/* && -f $root/.finance-backup-test-fixture ) ]] || fail 'unauthorized root'
target=$root/databases/finance-hub/lab
[[ -d $target && ! -L $target && $(stat -c %a "$target") == 700 ]] || fail 'invalid Lab artifact directory'
[[ -n ${FINANCE_RESTIC_REPOSITORY:-} && -d $FINANCE_RESTIC_REPOSITORY && ! -L $FINANCE_RESTIC_REPOSITORY ]] || fail 'invalid repository'
repository=$(realpath -e -- "$FINANCE_RESTIC_REPOSITORY")
[[ $repository == "$root"/restic/finance-hub-lab-p06 && $repository != "$target"/* ]] || fail 'repository outside dedicated Lab path'
[[ -f $repository/.finance-lab-p06-owned && ! -L $repository/.finance-lab-p06-owned ]] || fail 'missing repository ownership marker'
[[ $(stat -c %a "$repository/.finance-lab-p06-owned") == 600 && $(stat -c %u "$repository/.finance-lab-p06-owned") == "$(id -u)" ]] || fail 'unsafe repository ownership marker'
ownership_id=$(cat "$repository/.finance-lab-p06-owned")
[[ $ownership_id =~ ^[a-f0-9]{32}$ ]] || fail 'invalid repository ownership marker'
[[ -n ${FINANCE_RCLONE_REMOTE:-} && $FINANCE_RCLONE_REMOTE =~ ^finance-drive:FinanceHub-Backups/finance-lab-p06/[a-zA-Z0-9_-]+$ ]] || fail 'remote outside dedicated Lab prefix'
for secret in "${RESTIC_PASSWORD_FILE:-}" "${RCLONE_CONFIG_FILE:-}" "${PGPASSFILE:-}"; do
  [[ -n $secret && -f $secret && ! -L $secret && $(stat -c %a "$secret") == 600 ]] || fail 'restricted external secret file required'
  secret=$(realpath -e -- "$secret")
  [[ $secret != "$root"/* && $secret != "$repository"/* ]] || fail 'secret in backup tree'
done
[[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_COMMAND:-} && -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} && -z ${RCLONE_CONFIG:-} ]] || fail 'inline secrets forbidden'
export RESTIC_REPOSITORY="$repository" RCLONE_CONFIG="$RCLONE_CONFIG_FILE"
for command in flock restic rclone python3 pg_restore sha256sum; do command -v "$command" >/dev/null || fail 'missing tool'; done
safe_control() { [[ ! -L $1 && ( ! -e $1 || ( -f $1 && $(stat -c %h "$1") == 1 && $(stat -c %u "$1") == "$(id -u)" ) ) ]]; }
lock=$root/.finance-lab-p06.lock
failure=$root/.finance-lab-p06-failure
success=$root/.finance-lab-p06-success
active_slot_file=$root/.finance-lab-p06-active-slot
for path in "$lock" "$failure" "$success" "$active_slot_file"; do safe_control "$path" || fail 'unsafe control file'; done
atomic_stamp() { local tmp; tmp=$(mktemp "$root/.finance-lab-p06.XXXXXXXX"); date -u +%Y-%m-%dT%H:%M:%SZ >"$tmp"; safe_control "$1" || fail 'unsafe marker'; mv -T -- "$tmp" "$1"; }
atomic_value() { local tmp; tmp=$(mktemp "$root/.finance-lab-p06.XXXXXXXX"); printf '%s\n' "$2" >"$tmp"; safe_control "$1" || fail 'unsafe marker'; mv -T -- "$tmp" "$1"; }
# Status reads atomic markers and must still check freshness during a long backup.
if [[ $mode == status ]]; then
  [[ ! -e $failure ]] || fail 'ALERT_LAST_RUN_FAILED'
  [[ -f $success ]] || fail 'ALERT_NO_VERIFIED_OFFSITE'
  [[ -f $active_slot_file && $(cat "$active_slot_file") =~ ^slot-[ab]$ ]] || fail 'ALERT_INVALID_SUCCESS_STATE'
  stamp=$(cat "$success")
  [[ $stamp =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail 'ALERT_INVALID_SUCCESS_STATE'
  epoch=$(date -u -d "$stamp" +%s) || fail 'ALERT_INVALID_SUCCESS_STATE'
  now=$(date -u +%s)
  (( epoch <= now && now - epoch <= 86400 )) || fail 'ALERT_BACKUP_OLDER_THAN_24H'
  log "OFFSITE_VERIFIED last_success=$stamp"
  exit 0
fi
exec 9>>"$lock"
safe_control "$lock" || fail 'unsafe lock'
[[ $(stat -Lc %d:%i /proc/self/fd/9) == "$(stat -c %d:%i "$lock")" ]] || fail 'lock changed'
flock -n 9 || fail 'LOCKED'
trap 'rc=$?; if (( rc != 0 )); then atomic_stamp "$failure" || log "ALERT_MARKER_FAILED" >&2; fi' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
log "STARTED mode=$mode environment=lab database=finance_hub_lab at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'
if [[ $mode == weekly-check ]]; then log 'INTEGRITY_CHECK_COMPLETE'; exit 0; fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ $root == /opt/apps/backups ]]; then
  dump_output=$(bash "$script_dir/finance-hub-lab-docker-dump.sh") || fail 'DUMP_FAILED'
else
  dump_output=$(bash "$script_dir/finance-hub-lab-dump.sh") || fail 'DUMP_FAILED'
fi
name=$(printf '%s\n' "$dump_output" | sed -n 's/^finance backup: complete //p')
[[ $name =~ ^finance-hub_lab_finance_hub_lab_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_[0-9]+_[a-f0-9]{8}$ ]] || fail 'invalid artifact name'
verify_artifact() {
  local path=$1
  [[ -d $path && ! -L $path && -f $path/archive.dump && ! -L $path/archive.dump && -f $path/manifest.json && ! -L $path/manifest.json ]] || return 1
  [[ $(find "$path" -mindepth 1 -maxdepth 1 | wc -l) == 2 ]] || return 1
  python3 - "$path" 2>/dev/null <<'PY' || return 1
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]); m=json.loads((p/'manifest.json').read_text()); h=hashlib.sha256(); size=0
with (p/'archive.dump').open('rb') as f:
    assert f.read(5)==b'PGDMP'
    f.seek(0)
    while chunk:=f.read(1024*1024):
        size+=len(chunk); h.update(chunk)
assert m['format']=='pg_dump-custom' and m['environment']=='lab' and m['database']=='finance_hub_lab'
assert m['bytes']==size and m['sha256']==h.hexdigest()
PY
  pg_restore --list "$path/archive.dump" >/dev/null 2>&1
}
artifact=$target/$name
verify_artifact "$artifact" || fail 'INVALID_DUMP_OR_MANIFEST'
dump_bytes=$(stat -c %s "$artifact/archive.dump")
log "LOCAL_BACKUP_COMPLETE dump_bytes=$dump_bytes"
restic backup --quiet --tag finance-hub-lab-p06 -- "$artifact" >/dev/null 2>&1 || fail 'SNAPSHOT_FAILED'
restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'
snapshots=$(restic snapshots --json 2>/dev/null) || fail 'SNAPSHOT_LIST_FAILED'
SNAPSHOTS_JSON="$snapshots" python3 - "$target" <<'PY' || fail 'UNOWNED_SNAPSHOT'
import json,os,sys
s=json.loads(os.environ['SNAPSHOTS_JSON']); t=sys.argv[1]+'/'
assert s and all('finance-hub-lab-p06' in x.get('tags',[]) and len(x.get('paths',[]))==1 and x['paths'][0].startswith(t) for x in s)
PY
snapshot_id=$(SNAPSHOTS_JSON="$snapshots" python3 - "$artifact" <<'PY'
import json,os,sys
matches=[x for x in json.loads(os.environ['SNAPSHOTS_JSON']) if x.get('paths')==[sys.argv[1]] and 'finance-hub-lab-p06' in x.get('tags',[])]
assert matches
print(sorted(matches,key=lambda x:x['time'])[-1]['id'])
PY
) || fail 'SNAPSHOT_ID_MISSING'
[[ $snapshot_id =~ ^[a-f0-9]{64}$ ]] || fail 'SNAPSHOT_ID_MISSING'
restic forget --tag finance-hub-lab-p06 --group-by '' --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune --quiet >/dev/null 2>&1 || fail 'RETENTION_FAILED'
restic check --quiet >/dev/null 2>&1 || fail 'INTEGRITY_CHECK_FAILED'
while IFS= read -r -d '' entry; do
  relative=${entry#"$repository"/}
  [[ ! -L $entry ]] || fail 'UNOWNED_REPOSITORY_ENTRY'
  if [[ -d $entry ]]; then
    [[ $relative =~ ^(data|index|keys|locks|snapshots)$ || $relative =~ ^data/[a-f0-9]{2}$ ]] || fail 'UNOWNED_REPOSITORY_ENTRY'
  elif [[ -f $entry ]]; then
    [[ $relative == config || $relative == .finance-lab-p06-owned || $relative =~ ^(index|keys|locks|snapshots)/[a-f0-9]{64}$ || $relative =~ ^data/[a-f0-9]{2}/[a-f0-9]{64}$ ]] || fail 'UNOWNED_REPOSITORY_ENTRY'
  else
    fail 'UNOWNED_REPOSITORY_ENTRY'
  fi
done < <(find "$repository" -mindepth 1 -print0)
# Update the inactive slot so the last verified off-site repository stays recoverable.
active_slot=none
if [[ -e $active_slot_file ]]; then active_slot=$(cat "$active_slot_file"); fi
[[ $active_slot == none || $active_slot == slot-a || $active_slot == slot-b ]] || fail 'INVALID_ACTIVE_SLOT'
if [[ $active_slot == slot-a ]]; then next_slot=slot-b; else next_slot=slot-a; fi
remote_slot=$FINANCE_RCLONE_REMOTE/$next_slot
rclone mkdir "$remote_slot" >/dev/null 2>&1 || fail 'REMOTE_INCOMPLETE'
remote_listing=$(rclone lsf "$remote_slot" --recursive 2>/dev/null) || fail 'REMOTE_INCOMPLETE'
if [[ -n $remote_listing ]]; then
  remote_marker=$(rclone cat "$remote_slot/.finance-lab-p06-owned" 2>/dev/null) || fail 'UNOWNED_REMOTE_DESTINATION'
  [[ $remote_marker == "$ownership_id" ]] || fail 'UNOWNED_REMOTE_DESTINATION'
  while IFS= read -r entry; do
    [[ $entry == config || $entry == .finance-lab-p06-owned || $entry =~ ^(data|index|keys|locks|snapshots)/$ || $entry =~ ^data/[a-f0-9]{2}/$ || $entry =~ ^(index|keys|locks|snapshots)/[a-f0-9]{64}$ || $entry =~ ^data/[a-f0-9]{2}/[a-f0-9]{64}$ ]] || fail 'UNOWNED_REMOTE_ENTRY'
  done <<< "$remote_listing"
fi
rclone sync "$repository" "$remote_slot" --quiet >/dev/null 2>&1 || fail 'REMOTE_INCOMPLETE'
rclone check "$repository" "$remote_slot" --quiet >/dev/null 2>&1 || fail 'REMOTE_INCOMPLETE'
atomic_value "$active_slot_file" "$next_slot"
atomic_stamp "$success"
log "OFFSITE_RETENTION_VERIFIED snapshot=$snapshot_id slot=$next_slot"
mapfile -t entries < <(find "$target" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)
for entry in "${entries[@]}"; do
  [[ $entry =~ ^finance-hub_lab_finance_hub_lab_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_[0-9]+_[a-f0-9]{8}$ ]] || fail 'UNOWNED_LOCAL_ENTRY'
  verify_artifact "$target/$entry" || fail 'INVALID_LOCAL_ARTIFACT'
done
if (( ${#entries[@]} > 3 )); then
  for entry in "${entries[@]:0:${#entries[@]}-3}"; do
    rm -- "$target/$entry/archive.dump" "$target/$entry/manifest.json" || fail 'LOCAL_RETENTION_FAILED'
    rmdir -- "$target/$entry" || fail 'LOCAL_RETENTION_FAILED'
  done
fi
safe_control "$failure" || fail 'unsafe failure marker'
rm -f -- "$failure"
log "SUCCESS finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
