#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance lab restore: FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 2 ]] || fail 'usage: finance-hub-lab-restore.sh RECOVERED_ARTIFACT NEW_TARGET_DATABASE'
artifact=$1
target=$2
[[ $target =~ ^finance_restore_[a-z0-9_]+$ ]] || fail 'new restore database name required'
[[ ${FINANCE_RESTORE_ALLOWED_DATABASE:-} == "$target" ]] || fail 'exact target authorization required'
[[ ${FINANCE_RESTORE_SOURCE_DATABASE:-} == finance_hub_lab && ${FINANCE_RESTORE_SOURCE_ENVIRONMENT:-} == lab ]] || fail 'Finance Lab source only'
[[ ${FINANCE_SOURCE_PGHOST:-} == postgres-products ]] || fail 'source identity mismatch'
[[ -n ${PGHOST:-} && $PGHOST != "$FINANCE_SOURCE_PGHOST" && $PGHOST != postgres-products ]] || fail 'target must use a different PostgreSQL host'
[[ ${FINANCE_RECOVERY_INSTANCE:-} =~ ^finance-hub-p05-restore-[a-z0-9-]+$ ]] || fail 'dedicated P05 recovery instance required'
[[ $FINANCE_RECOVERY_INSTANCE != finance-hub-restore-test ]] || fail 'preexisting restore instance forbidden'
[[ -f $artifact/archive.dump && -f $artifact/manifest.json ]] || fail 'recovered artifact required'
exec bash "$(dirname -- "$0")/finance-hub-restore.sh" "$artifact" "$target"
