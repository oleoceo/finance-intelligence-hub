#!/bin/bash
# Native WSL2 test runner for migration integration tests
# Uses Linux-native Node.js and pnpm where Docker is directly accessible

set -e

cd /mnt/c/Projetos/finance-intelligence-hub

# Use native Linux pnpm from NVM
export PATH="/home/leoceo/.nvm/versions/node/v24.22.0/bin:$PATH"

# Disable Ryuk (Testcontainers cleanup container) to avoid permission issues
export TESTCONTAINERS_RYUK_DISABLED=true

# Run the migration integration tests
pnpm vitest run tests/integration/migration.test.ts