# Test Conventions

## Test Types

### Unit Tests
- Location: `packages/*/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`
- Purpose: Test isolated logic without external dependencies
- Requirements: No database, no network, no Testcontainers
- Execution: `pnpm test` or `pnpm test:unit`

### Integration Tests
- Location: `tests/integration/**/*.test.ts`
- Purpose: Test real PostgreSQL interactions via Testcontainers
- Requirements: Docker/Testcontainers available, isolated containers per test suite
- Execution: `pnpm test:integration` or `pnpm test:integration:postgres`

## Test Discovery Patterns

- Include: `**/*.test.ts`
- Exclude: `**/node_modules/**`, `**/dist/**`, `**/.git/**`
- Deterministic: Patterns are consistent across all configurations

## Testcontainers Lifecycle

### Startup
- Each integration test suite starts its own ephemeral PostgreSQL container
- Container image: `postgres:18.6-bookworm`
- Wait strategy: Log message detection for readiness
- Startup timeout: 120 seconds

### Cleanup
- Containers are stopped in `afterAll` hooks
- No orphaned containers should remain after test execution
- Single-fork pool ensures sequential execution to avoid Docker socket conflicts in WSL2

### WSL2 Considerations
- Single-fork execution mode prevents concurrent Docker socket access
- 3-second stabilization delay after port mapping for reliable connections

## Production Database Guardrail

Tests will abort immediately if `finance_hub_prod` is detected in:
- `DATABASE_URL` environment variable
- `PGDATABASE` environment variable

This guardrail runs before any test execution via `vitest.setup.ts`.

## Root Test Commands

```bash
# Run all unit tests (workspace projects)
pnpm test

# Alias for unit tests
pnpm test:unit

# Run all integration tests
pnpm test:integration

# Run PostgreSQL integration tests specifically
pnpm test:integration:postgres

# Run all tests (unit + integration)
pnpm test:all
```

## Environment Requirements

- Node.js 24.x
- pnpm >= 9.0.0
- Docker Engine (for integration tests)
- Native WSL2 Linux environment recommended for Testcontainers

## Failure Exit Codes

All test commands exit with non-zero code on failure, enabling reliable CI detection.