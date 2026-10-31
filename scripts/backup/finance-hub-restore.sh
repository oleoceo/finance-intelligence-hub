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
[[ ${FINANCE_RESTORE_SOURCE_DATABASE:-} =~ ^[a-z][a-z0-9_]*$ && ${FINANCE_RESTORE_SOURCE_DATABASE:-} != finance_hub_prod ]] || fail 'valid authorized source required'
[[ ${FINANCE_RESTORE_SOURCE_ENVIRONMENT:-} == local || ${FINANCE_RESTORE_SOURCE_ENVIRONMENT:-} == lab ]] || fail 'authorized source environment required'
[[ -d $artifact && ! -L $artifact && -f $artifact/archive.dump && ! -L $artifact/archive.dump && -f $artifact/manifest.json && ! -L $artifact/manifest.json ]] || fail 'complete artifact required'
[[ $(basename -- "$artifact") != .staging.* && ! -e $artifact/archive.list ]] || fail 'published artifact required'
[[ -n ${PGHOST:-} && -n ${PGPORT:-} && -n ${PGUSER:-} && -n ${PGPASSFILE:-} ]] || fail 'external recovery connection required'
[[ -f $PGPASSFILE && ! -L $PGPASSFILE && $(stat -c %a "$PGPASSFILE") == 600 ]] || fail 'restricted password file required'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
[[ $PGPORT =~ ^[0-9]{1,5}$ ]] || fail 'invalid port'
[[ -f ${FINANCE_RESTORE_BOOTSTRAP:-} && ! -L ${FINANCE_RESTORE_BOOTSTRAP:-} ]] || fail 'bootstrap file required'
manifest=$(python3 -c 'import json,re,sys; m=json.load(open(sys.argv[1])); assert isinstance(m,dict) and m.get("format") == "pg_dump-custom" and type(m.get("bytes")) is int and m["bytes"] > 0 and isinstance(m.get("sha256"),str) and re.fullmatch("[a-f0-9]{64}",m["sha256"]) and isinstance(m.get("database"),str) and m["database"] == sys.argv[2] and isinstance(m.get("environment"),str) and m["environment"] == sys.argv[3]; print(m["sha256"],m["bytes"])' "$artifact/manifest.json" "$FINANCE_RESTORE_SOURCE_DATABASE" "$FINANCE_RESTORE_SOURCE_ENVIRONMENT" 2>/dev/null) || fail 'invalid manifest or unauthorized archive identity'
read -r manifest_sha manifest_size <<<"$manifest"
[[ $(stat -c %s "$artifact/archive.dump") == "$manifest_size" ]] || fail 'archive size mismatch'
[[ $(sha256sum "$artifact/archive.dump" | cut -d ' ' -f1) == "$manifest_sha" ]] || fail 'archive checksum mismatch'
env -i PATH="$PATH" pg_restore --list "$artifact/archive.dump" >/dev/null 2>/dev/null || fail 'archive inspection failed'
export PGCONNECT_TIMEOUT=5
psql_safe() { env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" psql -X -v ON_ERROR_STOP=1 "$@"; }
[[ $(psql_safe -d postgres -Atc 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user' 2>/dev/null) == t ]] || fail 'authorized recovery superuser required'
[[ $(psql_safe -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$target'" 2>/dev/null) == 1 ]] || fail 'target database must already exist'
empty_sql="SELECT NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_conversion c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_ts_config c JOIN pg_namespace n ON n.oid=c.cfgnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_ts_dict d JOIN pg_namespace n ON n.oid=d.dictnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_ts_parser p JOIN pg_namespace n ON n.oid=p.prsnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_ts_template t JOIN pg_namespace n ON n.oid=t.tmplnamespace WHERE n.nspname='public') AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql') AND NOT EXISTS (SELECT 1 FROM pg_event_trigger) AND NOT EXISTS (SELECT 1 FROM pg_foreign_data_wrapper) AND NOT EXISTS (SELECT 1 FROM pg_foreign_server) AND NOT EXISTS (SELECT 1 FROM pg_publication)"
[[ $(psql_safe -d "$target" -Atc "$empty_sql" 2>/dev/null) == t ]] || fail 'target database must be empty'
start=$SECONDS
psql_safe -d "$target" -f "$FINANCE_RESTORE_BOOTSTRAP" >/dev/null 2>/dev/null || fail 'bootstrap failed'
if ! env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role=finance_hub_migrations -d "$target" "$artifact/archive.dump" >/dev/null 2>/dev/null; then
  fail 'pg_restore failed; discard the isolated target before retry'
fi
psql_safe -d "$target" -f "$FINANCE_RESTORE_BOOTSTRAP" >/dev/null 2>/dev/null || fail 'grant reconciliation failed'
printf 'finance restore: complete elapsed_seconds=%s\n' "$((SECONDS-start))"
