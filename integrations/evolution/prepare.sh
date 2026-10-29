#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
target="${1:?pass an empty target directory path}"
test ! -e "$target" || { echo 'Target already exists' >&2; exit 1; }
git clone --depth 1 --branch 2.3.7 https://github.com/EvolutionAPI/evolution-api.git "$target"
test "$(git -C "$target" rev-parse HEAD)" = cd800f2976e1e5b682fbf86a01ee4d85ae61f370
git -C "$target" apply --check "$repo_root/integrations/evolution/m06-logging.patch"
git -C "$target" apply "$repo_root/integrations/evolution/m06-logging.patch"
"${NODE_BIN:-node}" "$repo_root/integrations/evolution/verify.mjs" "$target"
git -C "$target" diff --check
echo 'Patched Evolution 2.3.7 source verified; build only from this directory.'
