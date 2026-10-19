#!/bin/bash
# Production Database Guardrail
# This script aborts test execution if it detects finance_hub_prod configuration
# to prevent accidental data loss or corruption in Production.

set -euo pipefail

# Check DATABASE_URL environment variable
if [ -n "${DATABASE_URL:-}" ]; then
  if echo "$DATABASE_URL" | grep -q "finance_hub_prod"; then
    echo "ERROR: Test execution aborted - detected finance_hub_prod in DATABASE_URL"
    echo "Tests must never target the production database."
    echo "Use an isolated test database instead."
    exit 1
  fi
fi

# Check PGDATABASE environment variable
if [ -n "${PGDATABASE:-}" ]; then
  if [ "$PGDATABASE" = "finance_hub_prod" ]; then
    echo "ERROR: Test execution aborted - detected finance_hub_prod in PGDATABASE"
    echo "Tests must never target the production database."
    echo "Use an isolated test database instead."
    exit 1
  fi
fi

echo "Production database guardrail check passed."
exit 0