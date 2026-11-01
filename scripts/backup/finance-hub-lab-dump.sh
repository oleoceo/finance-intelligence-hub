#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance lab dump: FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 0 ]] || fail 'no arguments allowed'
[[ ${FINANCE_BACKUP_ALLOWED_DATABASE:-} == finance_hub_lab ]] || fail 'Finance Lab database authorization required'
[[ ${PGHOST:-} == postgres-products && ${PGPORT:-} == 5432 ]] || fail 'internal Finance source identity required'
[[ -n ${PGUSER:-} && -n ${PGPASSFILE:-} && -f $PGPASSFILE && ! -L $PGPASSFILE && $(stat -c %a "$PGPASSFILE") == 600 ]] || fail 'restricted read-only credential file required'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
permissions=$(env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT=5 psql -X -qAt -v ON_ERROR_STOP=1 -d finance_hub_lab -c "SELECT (NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE')) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p') AND (has_table_privilege(current_user,c.oid,'INSERT') OR has_table_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE') OR has_table_privilege(current_user,c.oid,'TRUNCATE')))) FROM pg_roles r WHERE r.rolname=current_user" 2>/dev/null) || fail 'source privilege verification failed'
[[ $permissions == t ]] || fail 'source identity has write or elevated privileges'
start=$SECONDS
bash "$(dirname -- "$0")/finance-hub-dump.sh" lab finance_hub_lab
printf 'finance lab dump: elapsed_seconds=%s\n' "$((SECONDS-start))"
