#!/usr/bin/env node
/**
 * CLI script to apply all pending migrations.
 * Usage: pnpm migrate:up
 */
import { migrateUp } from '../migrator.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('Applying pending migrations...');

  try {
    const { results } = await migrateUp({ connectionString });

    if (results.length === 0) {
      console.log('No pending migrations.');
      process.exit(0);
    }

    let hasError = false;
    for (const result of results) {
      if (result.status === 'Success') {
        console.log(`✓ Applied: ${result.migrationName}`);
      } else {
        console.error(`✗ Failed: ${result.migrationName}`);
        hasError = true;
      }
    }

    if (hasError) {
      console.error('\nMigration failed. See errors above.');
      process.exit(1);
    }

    console.log('\nAll migrations applied successfully.');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

main();
