#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance fingerprint: FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 1 && ( $1 == source || $1 == target ) ]] || fail 'usage: finance-hub-lab-fingerprint.sh source|target'
mode=$1
[[ -n ${PGHOST:-} && -n ${PGPORT:-} && -n ${PGUSER:-} && -n ${PGPASSFILE:-} ]] || fail 'explicit PostgreSQL connection required'
[[ -f $PGPASSFILE && ! -L $PGPASSFILE && $(stat -c %a "$PGPASSFILE") == 600 ]] || fail 'restricted password file required'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
if [[ $mode == source ]]; then
  [[ $PGHOST == postgres-products && $PGPORT == 5432 && ${FINANCE_BACKUP_ALLOWED_DATABASE:-} == finance_hub_lab ]] || fail 'Finance Lab source only'
  database=finance_hub_lab
else
  [[ $PGHOST != postgres-products && ${FINANCE_RESTORE_ALLOWED_DATABASE:-} =~ ^finance_restore_[a-z0-9_]+$ ]] || fail 'isolated target only'
  database=$FINANCE_RESTORE_ALLOWED_DATABASE
fi
query() { env -i PATH="$PATH" PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGPASSFILE="$PGPASSFILE" PGCONNECT_TIMEOUT=5 psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" -c "$1" 2>/dev/null; }
tables=(books accounts categories merchants classification_rules authorized_senders inbox_messages interpretations confirmation_sessions transactions audit_events idempotency_keys outbox_events)
printf 'database=%s\n' "$database"
for table in "${tables[@]}"; do
  count=$(query "SELECT count(*) FROM public.$table") || fail 'table count failed'
  checksum=$(query "COPY (SELECT row_to_json(t)::text FROM public.$table t ORDER BY t.id) TO STDOUT" | sha256sum | cut -d ' ' -f1) || fail 'table fingerprint failed'
  [[ $count =~ ^[0-9]+$ && $checksum =~ ^[a-f0-9]{64}$ ]] || fail 'invalid fingerprint result'
  printf '%s %s %s\n' "$table" "$count" "$checksum"
done
query 'SELECT name FROM public.kysely_migration ORDER BY name' | sha256sum | cut -d ' ' -f1 | sed 's/^/migrations sha256=/' || fail 'migration fingerprint failed'
