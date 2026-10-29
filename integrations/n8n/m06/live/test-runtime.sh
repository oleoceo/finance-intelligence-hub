#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."
# Local/CI only. No ports, host network, real credentials, or persistent volumes.
docker run --rm --network none --add-host finance-lab-api:127.0.0.1 --entrypoint node \
  -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -e N8N_CUSTOM_EXTENSIONS=/custom -e N8N_USER_FOLDER=/tmp/m06-n8n \
  -v "$PWD/integrations/n8n/m06/live/dist:/custom:ro" \
  -v "$PWD/integrations/n8n/m06/live:/fixture:ro" \
  n8nio/n8n:2.23.3@sha256:c0c39b1ca69d43f736bc65f8ddd70972a8989f736e8a4b6a075823f98cc48a23 \
  /fixture/runtime-check.cjs
