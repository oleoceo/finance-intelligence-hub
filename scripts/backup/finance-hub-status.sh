#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -eq 0 && ${FINANCE_BACKUP_FIXTURE_ONLY:-} == yes && -n ${FINANCE_BACKUP_ROOT:-} && -d $FINANCE_BACKUP_ROOT && ! -L $FINANCE_BACKUP_ROOT ]] || { echo 'finance status: FAILED invalid fixture' >&2; exit 1; }
root=$(cd -- "$FINANCE_BACKUP_ROOT" && pwd -P)
[[ -f $root/.finance-backup-test-fixture && ! -L $root/.finance-backup-test-fixture ]] || { echo 'finance status: FAILED invalid fixture' >&2; exit 1; }
[[ ! -e $root/.finance-last-failure ]] || { echo 'finance status: ALERT_LAST_RUN_FAILED'; exit 2; }
stamp=$root/.finance-offsite-success
[[ -f $stamp && ! -L $stamp ]] || { echo 'finance status: ALERT_NO_VERIFIED_OFFSITE'; exit 2; }
value=$(cat -- "$stamp")
[[ $value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { echo 'finance status: ALERT_INVALID_SUCCESS_STATE'; exit 2; }
then_epoch=$(date -u -d "$value" +%s) || { echo 'finance status: ALERT_INVALID_SUCCESS_STATE'; exit 2; }
now_epoch=$(date -u +%s)
(( then_epoch <= now_epoch && now_epoch - then_epoch <= 86400 )) || { echo 'finance status: ALERT_BACKUP_OLDER_THAN_24H'; exit 2; }
echo "finance status: OFFSITE_VERIFIED last_success=$value"
