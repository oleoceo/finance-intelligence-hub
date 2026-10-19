#!/usr/bin/env node
/**
 * CLI script to roll back the last applied migration.
 * Usage: pnpm migrate:down
 */
import { migrateDown } from '../migrator.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('Rolling back last migration...');

  try {
    const { results } = await migrateDown({ connectionString });

    if (results.length === 0) {
      console.log('No migrations to roll back.');
      process.exit(0);
    }

    let hasError = false;
    for (const result of results) {
      if (result.status === 'Success') {
        console.log(`✓ Rolled back: ${result.migrationName}`);
      } else {
        console.error(`✗ Failed: ${result.migrationName}`);
        hasError = true;
      }
    }

    if (hasError) {
      console.error('\nRollback failed. See errors above.');
      process.exit(1);
    }

    console.log('\nRollback completed successfully.');
  } catch (error) {
    console.error('Rollback error:', error);
    process.exit(1);
  }
}

main();
