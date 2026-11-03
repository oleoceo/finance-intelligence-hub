#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 1 && -f $1/archive.dump && ! -L $1/archive.dump ]] || exit 1
[[ ${FINANCE_P06_CLIENT_IMAGE_ID:-} =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
[[ $(docker image inspect finance-hub-p05-client --format '{{.Id}}' 2>/dev/null) == "$FINANCE_P06_CLIENT_IMAGE_ID" ]] || exit 1
exec docker run --rm --network none --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --read-only \
  --mount "type=bind,src=$1,dst=/artifact,readonly" \
  "$FINANCE_P06_CLIENT_IMAGE_ID" pg_restore --list /artifact/archive.dump
