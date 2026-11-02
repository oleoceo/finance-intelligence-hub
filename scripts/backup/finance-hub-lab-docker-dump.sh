#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { printf 'finance lab docker dump: FAILED %s\n' "$1" >&2; exit 1; }
[[ $# == 0 && $(id -un) == leoceo ]] || fail 'operator identity required'
[[ ${FINANCE_LAB_SCHEDULE_ENABLED:-} == yes && ${FINANCE_BACKUP_ALLOWED_DATABASE:-} == finance_hub_lab ]] || fail 'Lab authorization required'
[[ ${FINANCE_BACKUP_ROOT:-} == /opt/apps/backups && ${PGHOST:-} == postgres-products && ${PGPORT:-} == 5432 && -n ${PGUSER:-} ]] || fail 'source identity required'
[[ -z ${PGPASSWORD:-} && -z ${DATABASE_URL:-} ]] || fail 'inline credentials forbidden'
[[ -n ${PGPASSFILE:-} && -f $PGPASSFILE && ! -L $PGPASSFILE && $(stat -c %a -- "$PGPASSFILE") == 600 && $(stat -c %u -- "$PGPASSFILE") == "$(id -u)" ]] || fail 'operator-owned credential required'
[[ -d /opt/apps/backups/databases/finance-hub/lab && ! -L /opt/apps/backups/databases/finance-hub/lab && $(stat -c %U:%G:%a -- /opt/apps/backups/databases/finance-hub/lab) == leoceo:leoceo:700 && -w /opt/apps/backups/databases/finance-hub/lab ]] || fail 'Lab directory inaccessible'
checkout=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ $checkout == /opt/apps/apps/lab/finance-hub-p06 && -f $checkout/scripts/backup/finance-hub-lab-dump.sh ]] || fail 'unexpected checkout'
[[ $(docker network inspect --format '{{.Internal}}' finance-products-db 2>/dev/null) == true ]] || fail 'source network is not internal'
[[ $(docker inspect --format '{{if index .NetworkSettings.Networks "finance-products-db"}}yes{{end}}' postgres-products 2>/dev/null) == yes ]] || fail 'source not on expected network'
[[ ${FINANCE_P06_CLIENT_IMAGE_ID:-} =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'reviewed client image ID required'
image_id=$(docker image inspect finance-hub-p05-client --format '{{.Id}}' 2>/dev/null) || fail 'client image missing'
[[ $image_id == "$FINANCE_P06_CLIENT_IMAGE_ID" ]] || fail 'client image changed'
exec docker run --rm --network finance-products-db --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --read-only \
  --mount "type=bind,src=$checkout,dst=$checkout,readonly" \
  --mount type=bind,src=/opt/apps/backups,dst=/opt/apps/backups,readonly \
  --mount type=bind,src=/opt/apps/backups/databases/finance-hub/lab,dst=/opt/apps/backups/databases/finance-hub/lab \
  --mount "type=bind,src=$PGPASSFILE,dst=$PGPASSFILE,readonly" \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSFILE \
  -e FINANCE_BACKUP_ALLOWED_DATABASE -e FINANCE_BACKUP_ROOT \
  -w "$checkout" "$image_id" \
  bash "$checkout/scripts/backup/finance-hub-lab-dump.sh"
