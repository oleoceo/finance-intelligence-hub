#!/usr/bin/env bash
set -Eeuo pipefail

# Local/CI runner. Operational use requires a separate M09 gate and review.
umask 077
fail() { printf 'finance backup: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 2 ]] || fail 'usage: finance-hub-dump.sh ENVIRONMENT DATABASE'
environment=$1
database=$2
[[ $environment == local || $environment == lab ]] || fail 'environment is not allowlisted'
[[ $database =~ ^[a-z][a-z0-9_]*$ ]] || fail 'invalid database name'
[[ -n ${FINANCE_BACKUP_ALLOWED_DATABASE:-} && $database == "$FINANCE_BACKUP_ALLOWED_DATABASE" ]] || fail 'database is not allowlisted'
[[ $database != finance_hub_prod ]] || fail 'production is not authorized'
[[ -n ${FINANCE_BACKUP_ROOT:-} && -d $FINANCE_BACKUP_ROOT && ! -L $FINANCE_BACKUP_ROOT ]] || fail 'backup root must be an existing real directory'
[[ -n ${PGHOST:-} && -n ${PGPORT:-} && -n ${PGUSER:-} && -n ${PGPASSFILE:-} ]] || fail 'external PostgreSQL connection settings are required'
[[ -f $PGPASSFILE && ! -L $PGPASSFILE ]] || fail 'password file must be a regular file'
[[ $(stat -c %a "$PGPASSFILE") == 600 ]] || fail 'password file must have mode 600'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'use PGPASSFILE, not inline credentials'
[[ $PGPORT =~ ^[0-9]{1,5}$ ]] || fail 'invalid port'

root=$(cd -- "$FINANCE_BACKUP_ROOT" && pwd -P)
target=$root/databases/finance-hub/$environment
[[ -d $root/databases && ! -L $root/databases && -d $root/databases/finance-hub && ! -L $root/databases/finance-hub && -d $target && ! -L $target ]] || fail 'expected layout is missing or linked'
[[ $(stat -c %a "$target") == 700 ]] || fail 'target directory must have mode 700'
stage=$(mktemp -d "$target/.staging.XXXXXXXX") || fail 'cannot create staging'
published=0
complete=0
cleanup() {
  if [[ $published == 1 && $complete == 0 ]]; then rm -f -- "$dump"; fi
  rm -f -- "$stage/archive.dump" "$stage/manifest.json" "$stage/archive.list"
  rmdir -- "$stage" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stamp=$(date -u +%Y-%m-%d_%H%M%S)
name="finance-hub_${environment}_${database}_${stamp}_$$_$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
dump=$target/$name.dump
manifest=$target/$name.sha256.json
[[ ! -e $dump && ! -e $manifest ]] || fail 'artifact collision'

# The connection is supplied by PG* environment variables; no URI or password is an argument.
if ! pg_dump --format=custom --no-password --dbname="$database" >"$stage/archive.dump" 2>/dev/null; then
  fail 'pg_dump failed'
fi
[[ -s $stage/archive.dump && ! -L $stage/archive.dump ]] || fail 'empty dump'
chmod 600 "$stage/archive.dump"
if ! pg_restore --list "$stage/archive.dump" >"$stage/archive.list" 2>/dev/null; then
  fail 'archive inspection failed'
fi
[[ -s $stage/archive.list ]] || fail 'empty archive listing'
checksum=$(sha256sum "$stage/archive.dump" | cut -d ' ' -f1)
size=$(stat -c %s "$stage/archive.dump")
printf '{"format":"pg_dump-custom","environment":"%s","database":"%s","created_at_utc":"%s","bytes":%s,"sha256":"%s"}\n' "$environment" "$database" "$stamp" "$size" "$checksum" > "$stage/manifest.json"
chmod 600 "$stage/manifest.json"

# Both artifacts live on the same filesystem. Hard links publish atomically and
# fail closed on a collision; the manifest is the completion marker.
ln -- "$stage/archive.dump" "$dump" || fail 'dump publication failed'
published=1
ln -- "$stage/manifest.json" "$manifest" || fail 'manifest publication failed'
complete=1
printf 'finance backup: complete %s\n' "$name"
