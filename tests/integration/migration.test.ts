import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import {
  migrateUp,
  migrateDown,
  getMigrationStatus,
  runMigrateWithProvider,
} from '@finance-hub/database';
import { Pool } from 'pg';
import { chain } from './schema-helpers.js';
import { createKyselyForMigrations, createMigrator } from '@finance-hub/database';
import { insert, book, account, sender, inbox, transaction } from './schema-helpers.js';
import { spawnSync } from 'node:child_process';

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

    expect(results.length).toBe(5);
    expect(results[0].status).toBe('Success');
    expect(results[0].migrationName).toContain('001_technical_validation');
    expect(results[1].status).toBe('Success');
    expect(results[1].migrationName).toContain('002_master_data');
    expect(results[2].status).toBe('Success');
    expect(results[2].migrationName).toContain('003_ingestion_structure');
    expect(results[3].status).toBe('Success');
    expect(results[3].migrationName).toContain('004_transaction_structure');
    expect(results[4].status).toBe('Success');
    expect(results[4].migrationName).toContain('005_audit_idempotency_outbox');
  });

  it('should track migration history correctly', async () => {
    const { executedMigrations } = await getMigrationStatus({ connectionString });

    expect(executedMigrations.map((m) => m.name)).toEqual(chain);
    expect(executedMigrations.map((m) => m.name)).toContain('001_technical_validation');
    expect(executedMigrations.map((m) => m.name)).toContain('002_master_data');
    expect(executedMigrations.map((m) => m.name)).toContain('003_ingestion_structure');
    expect(executedMigrations.map((m) => m.name)).toContain('004_transaction_structure');
    expect(executedMigrations.map((m) => m.name)).toContain('005_audit_idempotency_outbox');
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

    // Should roll back only the last migration (005_audit_idempotency_outbox)
    expect(results.length).toBe(1);
    expect(results[0].status).toBe('Success');
    expect(results[0].migrationName).toContain('005_audit_idempotency_outbox');
  });

  it('should show correct status after rolling back last migration', async () => {
    const { executedMigrations, pendingMigrations } = await getMigrationStatus({
      connectionString,
    });
    // After rolling back 005, 001, 002, 003 and 004 should remain
    expect(executedMigrations.length).toBe(4);
    expect(executedMigrations.map((m) => m.name)).toContain('001_technical_validation');
    expect(executedMigrations.map((m) => m.name)).toContain('002_master_data');
    expect(executedMigrations.map((m) => m.name)).toContain('003_ingestion_structure');
    expect(executedMigrations.map((m) => m.name)).toContain('004_transaction_structure');
    expect(pendingMigrations.length).toBe(1);
    expect(pendingMigrations[0]).toContain('005_audit_idempotency_outbox');
  });

  it('should re-apply rolled back migration successfully', async () => {
    const { results } = await migrateUp({ connectionString });
    // Should apply only the pending migration (005_audit_idempotency_outbox)
    expect(results.length).toBe(1);
    expect(results[0].status).toBe('Success');
    expect(results[0].migrationName).toContain('005_audit_idempotency_outbox');
  });

  it('should propagate migration failures and not silently continue as success', async () => {
    const admin = new Pool({ connectionString });
    try {
      await admin.query('CREATE DATABASE isolated_failure_test');
    } finally {
      await admin.end();
    }
    const isolated = new URL(connectionString);
    isolated.pathname = '/isolated_failure_test';
    let attempted = false;
    const failure = new Error('intentional migration failure');
    const failingProvider = {
      getMigrations: async () => ({
        '999_intentional_failure': {
          up: async () => {
            attempted = true;
            throw failure;
          },
          down: async () => {},
        },
      }),
    };

    const result = await runMigrateWithProvider(
      { connectionString: isolated.toString() },
      failingProvider,
    );

    // Prove failure is exposed via MigrationResultSet.error (not silently swallowed)
    expect(attempted).toBe(true);
    expect(result.error).toBe(failure);
    expect(String(result.error)).toContain('intentional migration failure');

    // Prove the failing migration was actually attempted
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);

    const failedResult = result.results!.find((r) => r.status === 'Error');
    expect(failedResult).toBeDefined();
    expect(failedResult!.migrationName).toBe('999_intentional_failure');
  });

  it('upgrades 001 through 005 with earlier data retained, and reverses each slice without damaging predecessors', async () => {
    const admin = new Pool({ connectionString });
    try {
      await admin.query('CREATE DATABASE incremental_test');
    } finally {
      await admin.end();
    }
    const url = new URL(connectionString);
    url.pathname = '/incremental_test';
    const options = { connectionString: url.toString() };
    const pool = new Pool(options);
    const kysely = createKyselyForMigrations(options);
    const migrator = createMigrator(kysely);
    try {
      const fixtures: Array<[string, string]> = [];
      let b: string;
      let a: string;
      let originId: string;
      for (const [index, name] of chain.entries()) {
        const result = await migrator.migrateTo(name);
        expect(result.error).toBeUndefined();
        expect(result.results).toEqual([
          { migrationName: name, direction: 'Up', status: 'Success' },
        ]);
        expect((await getMigrationStatus(options)).executedMigrations.map((m) => m.name)).toEqual(
          chain.slice(0, index + 1),
        );
        for (const [table, id] of fixtures)
          expect((await pool.query(`SELECT id FROM ${table} WHERE id=$1`, [id])).rowCount).toBe(1);
        if (index === 1) {
          b = await book(pool);
          a = await account(pool, b);
          fixtures.push(['books', b], ['accounts', a]);
        }
        if (index === 2) {
          const s = await sender(pool);
          const row = inbox(s);
          await insert(pool, 'inbox_messages', row);
          originId = row.id;
          fixtures.push(['inbox_messages', row.id]);
        }
        if (index === 3) {
          const tx = transaction(b!, a!, { inbox_message_id: originId! });
          await insert(pool, 'transactions', tx);
          fixtures.push(['transactions', tx.id]);
        }
      }
      expect((await migrateUp(options)).results).toEqual([]);
      expect((await pool.query('SELECT count(*) FROM outbox_events')).rows[0].count).toBe('0');
      for (const [i, name] of [...chain].reverse().entries()) {
        expect((await migrateDown(options)).results).toEqual([
          { migrationName: name, status: 'Success' },
        ]);
        const remaining =
          i === 0 ? fixtures : i === 1 ? fixtures.slice(0, 3) : i === 2 ? fixtures.slice(0, 2) : [];
        for (const [table, id] of remaining)
          expect((await pool.query(`SELECT id FROM ${table} WHERE id=$1`, [id])).rowCount).toBe(1);
      }
      expect((await migrateDown(options)).results).toEqual([]);
      expect((await migrateUp(options)).results.map((r) => r.migrationName)).toEqual(chain);
    } finally {
      await kysely.destroy();
      await pool.end();
    }
  });

  it('compiled pnpm migration CLI discovers the same chain and supports status/down/up/no-pending', () => {
    const run = (command: string) => {
      const result = spawnSync('pnpm', ['--filter', '@finance-hub/database', command], {
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: connectionString },
        timeout: 30000,
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };
    const status = run('migrate:status');
    for (const name of chain) expect(status).toContain(name);
    expect(status).toContain('No pending migrations.');
    expect(run('migrate:down')).toContain(chain[4]);
    expect(run('migrate:up')).toContain(chain[4]);
    expect(run('migrate:up')).toContain('No pending migrations.');
  }, 120000);

  it('production guard aborts for DATABASE_URL and PGDATABASE before any connection', () => {
    for (const forbidden of [
      { DATABASE_URL: 'postgresql://invalid.invalid/finance_hub_prod', PGDATABASE: '' },
      { DATABASE_URL: '', PGDATABASE: 'finance_hub_prod' },
    ]) {
      const result = spawnSync(process.execPath, ['vitest.setup.ts'], {
        encoding: 'utf8',
        env: { ...process.env, ...forbidden },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Test execution aborted - detected finance_hub_prod');
    }
  });
});
