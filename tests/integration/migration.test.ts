import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import {
  migrateUp,
  migrateDown,
  getMigrationStatus,
  runMigrateWithProvider,
} from '@finance-hub/database';
import type { Migration } from 'kysely';

describe('Migration Integration (Testcontainers)', { timeout: 120000 }, () => {
  let container: StartedTestContainer;
  let connectionString: string;

  beforeAll(async () => {
    // Start ephemeral PostgreSQL 18.6 container
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'migration_test_db',
        POSTGRES_USER: 'migration_user',
        POSTGRES_PASSWORD: 'migration_password',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .withStartupTimeout(120000)
      .start();

    const port = container.getMappedPort(5432);
    const host = container.getHost();

    // Wait for port binding to stabilize in WSL2
    await new Promise((resolve) => setTimeout(resolve, 3000));

    connectionString = `postgresql://migration_user:migration_password@${host}:${port}/migration_test_db`;
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('should apply migrations to empty database successfully', async () => {
    const { results } = await migrateUp({ connectionString });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].status).toBe('Success');
    expect(results[0].migrationName).toContain('technical_validation');
  });

  it('should track migration history correctly', async () => {
    const { executedMigrations } = await getMigrationStatus({ connectionString });

    expect(executedMigrations.length).toBeGreaterThan(0);
    expect(executedMigrations[0].name).toContain('technical_validation');
    expect(executedMigrations[0].timestamp).toBeDefined();
  });

  it('should be idempotent when rerunning with no pending migrations', async () => {
    const { results } = await migrateUp({ connectionString });

    // Should have no results since all migrations are already applied
    expect(results.length).toBe(0);
  });

  it('should show correct status after migrations are applied', async () => {
    const { executedMigrations, pendingMigrations } = await getMigrationStatus({
      connectionString,
    });

    expect(executedMigrations.length).toBeGreaterThan(0);
    expect(pendingMigrations.length).toBe(0);
  });

  it('should roll back migration successfully', async () => {
    const { results } = await migrateDown({ connectionString });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].status).toBe('Success');
    expect(results[0].migrationName).toContain('technical_validation');
  });

  it('should handle rollback when no migrations exist gracefully', async () => {
    const { results } = await migrateDown({ connectionString });

    // Should have no results since all migrations are already rolled back
    expect(results.length).toBe(0);
  });

  it('should propagate migration failures and not silently continue as success', async () => {
    // Inject a test-only failing migration via a custom provider (not in canonical directory)
    const failingProvider = {
      getMigrations: async (): Promise<Record<string, Migration>> => ({
        '999_intentional_failure': {
          up: async () => {
            throw new Error('intentional migration failure');
          },
          down: async () => {},
        },
      }),
    };

    const result = await runMigrateWithProvider({ connectionString }, failingProvider);

    // Prove failure is exposed via MigrationResultSet.error (not silently swallowed)
    expect(result.error).toBeDefined();
    expect(String(result.error)).toContain('intentional migration failure');

    // Prove the failing migration was actually attempted
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);

    const failedResult = result.results!.find((r) => r.status === 'Error');
    expect(failedResult).toBeDefined();
    expect(failedResult!.migrationName).toBe('999_intentional_failure');
  });
});
