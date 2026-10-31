#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance restore: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 2 ]] || fail 'usage: finance-hub-restore.sh ARTIFACT TARGET_DATABASE'
artifact=$1
target=$2
[[ $target =~ ^finance_restore_[a-z0-9_]+$ && $target != finance_hub_prod ]] || fail 'target is not an allowlisted restore database'
[[ -n ${FINANCE_RESTORE_ALLOWED_DATABASE:-} && $target == "$FINANCE_RESTORE_ALLOWED_DATABASE" ]] || fail 'target is not authorized'
[[ -n ${FINANCE_RESTORE_SOURCE_DATABASE:-} && $target != "$FINANCE_RESTORE_SOURCE_DATABASE" ]] || fail 'source and target must differ'
[[ -d $artifact && ! -L $artifact && -f $artifact/archive.dump && ! -L $artifact/archive.dump && -f $artifact/manifest.json && ! -L $artifact/manifest.json ]] || fail 'complete artifact required'
[[ -n ${PGHOST:-} && -n ${PGPORT:-} && -n ${PGUSER:-} && -n ${PGPASSFILE:-} ]] || fail 'external recovery connection required'
[[ -f $PGPASSFILE && ! -L $PGPASSFILE && $(stat -c %a "$PGPASSFILE") == 600 ]] || fail 'restricted password file required'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
[[ $PGPORT =~ ^[0-9]{1,5}$ ]] || fail 'invalid port'
[[ -f ${FINANCE_RESTORE_BOOTSTRAP:-} && ! -L ${FINANCE_RESTORE_BOOTSTRAP:-} ]] || fail 'bootstrap file required'
manifest=$(python3 -c 'import json,re,sys; m=json.load(open(sys.argv[1])); assert m["format"] == "pg_dump-custom" and isinstance(m["bytes"],int) and m["bytes"] > 0 and re.fullmatch("[a-f0-9]{64}",m["sha256"]); print(m["sha256"],m["bytes"])' "$artifact/manifest.json" 2>/dev/null) || fail 'invalid manifest'
read -r manifest_sha manifest_size <<<"$manifest"
[[ $(stat -c %s "$artifact/archive.dump") == "$manifest_size" ]] || fail 'archive size mismatch'
[[ $(sha256sum "$artifact/archive.dump" | cut -d ' ' -f1) == "$manifest_sha" ]] || fail 'archive checksum mismatch'
env -i PATH="$PATH" pg_restore --list "$artifact/archive.dump" >/dev/null 2>/dev/null || fail 'archive inspection failed'
export PGCONNECT_TIMEOUT=5
psql_safe() { env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" psql -X -v ON_ERROR_STOP=1 "$@"; }
[[ $(psql_safe -d postgres -Atc 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user' 2>/dev/null) == t ]] || fail 'authorized recovery superuser required'
[[ $(psql_safe -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$target'" 2>/dev/null) == 1 ]] || fail 'target database must already exist'
[[ $(psql_safe -d "$target" -Atc "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','S')" 2>/dev/null) == 0 ]] || fail 'target database must be empty'
start=$SECONDS
psql_safe -d "$target" -f "$FINANCE_RESTORE_BOOTSTRAP" >/dev/null 2>/dev/null || fail 'bootstrap failed'
if ! env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role=finance_hub_migrations -d "$target" "$artifact/archive.dump" >/dev/null 2>/dev/null; then
  fail 'pg_restore failed; discard the isolated target before retry'
fi
psql_safe -d "$target" -f "$FINANCE_RESTORE_BOOTSTRAP" >/dev/null 2>/dev/null || fail 'grant reconciliation failed'
printf 'finance restore: complete elapsed_seconds=%s\n' "$((SECONDS-start))"
