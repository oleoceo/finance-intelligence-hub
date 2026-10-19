import { Kysely, Migrator, PostgresDialect, type Migration } from 'kysely';
import { Pool } from 'pg';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MigrationOptions {
  connectionString: string;
}

/**
 * Determines the migration folder based on execution context.
 * - Source/Vitest: packages/database/migrations/*.ts
 * - Compiled CLI: packages/database/dist/migrations/*.js
 */
function resolveMigrationFolder(): string {
  // Check if we're running from compiled output (dist/src/)
  const distMigrations = path.join(__dirname, '..', 'migrations');
  if (existsSync(distMigrations)) {
    return distMigrations;
  }
  // Otherwise, we're in source mode (packages/database/src/)
  // Go up two levels to packages/database/migrations/
  return path.join(__dirname, '..', '..', 'migrations');
}

/**
 * Custom migration provider that loads migrations dynamically based on execution context.
 * - In source/Vitest: loads .ts files from packages/database/migrations/
 * - In compiled runtime: loads .js files from packages/database/dist/migrations/
 */
class DynamicMigrationProvider {
  private migrationFolder: string;

  constructor() {
    this.migrationFolder = resolveMigrationFolder();
  }

  async getMigrations(): Promise<Record<string, Migration>> {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(this.migrationFolder);

    const migrations: Record<string, Migration> = {};

    for (const file of files) {
      // Skip non-migration files
      if (file.includes('.test.') || file.endsWith('.d.ts') || file.endsWith('.map')) {
        continue;
      }

      // Determine valid extension based on context
      const isSourceMode = !this.migrationFolder.includes('dist');
      const isValidExtension = isSourceMode ? file.endsWith('.ts') : file.endsWith('.js');

      if (!isValidExtension) {
        continue;
      }

      const migrationName = file.replace(/\.(ts|js)$/, '');
      const filePath = path.join(this.migrationFolder, file);
      const fileUrl = pathToFileURL(filePath).href;

      const module = await import(fileUrl);
      migrations[migrationName] = {
        up: module.up,
        down: module.down,
      };
    }

    return migrations;
  }
}

/**
 * Creates a Kysely instance configured for migrations.
 */
export function createKyselyForMigrations(options: MigrationOptions): Kysely<unknown> {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: options.connectionString,
      }),
    }),
  });
}

/**
 * Creates a Kysely Migrator with a dynamic provider that works in both
 * source (Vitest) and compiled (CLI) execution contexts.
 */
export function createMigrator(kysely: Kysely<unknown>): Migrator {
  return new Migrator({
    db: kysely,
    provider: new DynamicMigrationProvider(),
  });
}

/**
 * Applies all pending migrations and returns the result.
 * Throws if any migration fails.
 */
export async function migrateUp(options: MigrationOptions): Promise<{
  results: Array<{ migrationName: string; status: 'Success' | 'Error' }>;
}> {
  const kysely = createKyselyForMigrations(options);
  const migrator = createMigrator(kysely);

  try {
    const result = await migrator.migrateToLatest();

    // Check for migration errors and propagate them
    if (result.error) {
      const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
      const failedMigration = result.results?.find((r) => r.status === 'Error');
      const migrationName = failedMigration?.migrationName || 'unknown';
      throw new Error(`Migration failed: ${migrationName} - ${errorMsg}`);
    }

    const results = (result.results ?? []).map((r) => ({
      migrationName: r.migrationName,
      status: r.status as 'Success' | 'Error',
    }));
    return { results };
  } finally {
    await kysely.destroy();
  }
}

/**
 * Rolls back the last applied migration.
 * Throws if rollback fails.
 */
export async function migrateDown(options: MigrationOptions): Promise<{
  results: Array<{ migrationName: string; status: 'Success' | 'Error' }>;
}> {
  const kysely = createKyselyForMigrations(options);
  const migrator = createMigrator(kysely);

  try {
    const result = await migrator.migrateDown();

    // Check for migration errors and propagate them
    if (result.error) {
      const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
      const failedMigration = result.results?.find((r) => r.status === 'Error');
      const migrationName = failedMigration?.migrationName || 'unknown';
      throw new Error(`Migration rollback failed: ${migrationName} - ${errorMsg}`);
    }

    const results = (result.results ?? []).map((r) => ({
      migrationName: r.migrationName,
      status: r.status as 'Success' | 'Error',
    }));
    return { results };
  } finally {
    await kysely.destroy();
  }
}

/**
 * Returns the current migration status using the same provider as execution.
 */
export async function getMigrationStatus(options: MigrationOptions): Promise<{
  executedMigrations: Array<{ name: string; timestamp: string }>;
  pendingMigrations: Array<string>;
}> {
  const kysely = createKyselyForMigrations(options);
  const migrator = createMigrator(kysely);

  try {
    const migrations = await migrator.getMigrations();

    const executedMigrations = migrations.filter((m) => m.executedAt != null);
    const executedNames = new Set(executedMigrations.map((m) => m.name));

    // Get all available migration names from the provider
    const provider = new DynamicMigrationProvider();
    const allMigrations = await provider.getMigrations();
    const allMigrationNames = Object.keys(allMigrations);

    const pendingMigrations = allMigrationNames.filter((name) => !executedNames.has(name));

    return {
      executedMigrations: executedMigrations.map((m) => ({
        name: m.name,
        timestamp: m.executedAt!.toString(),
      })),
      pendingMigrations,
    };
  } finally {
    await kysely.destroy();
  }
}

/**
 * Test-only helper: runs migrateToLatest with a custom provider.
 * Used to verify failure propagation without importing Kysely in tests.
 */
export async function runMigrateWithProvider(
  options: MigrationOptions,
  provider: { getMigrations(): Promise<Record<string, Migration>> },
): Promise<{
  error?: unknown;
  results?: Array<{ migrationName: string; status: 'Success' | 'Error' | 'NotExecuted' }>;
}> {
  const kysely = createKyselyForMigrations(options);
  const migrator = new Migrator({ db: kysely, provider });

  try {
    const result = await migrator.migrateToLatest();
    return {
      error: result.error,
      results: (result.results ?? []).map((r) => ({
        migrationName: r.migrationName,
        status: r.status,
      })),
    };
  } finally {
    await kysely.destroy();
  }
}
