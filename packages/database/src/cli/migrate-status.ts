#!/usr/bin/env node
/**
 * CLI script to show migration status.
 * Usage: pnpm migrate:status
 */
import { getMigrationStatus } from '../migrator.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('Migration Status\n');

  try {
    const { executedMigrations, pendingMigrations } = await getMigrationStatus({
      connectionString,
    });

    if (executedMigrations.length > 0) {
      console.log('Executed migrations:');
      for (const m of executedMigrations) {
        console.log(` ✓ ${m.name} (applied at ${m.timestamp})`);
      }
    } else {
      console.log('No executed migrations.');
    }

    console.log('');

    if (pendingMigrations.length > 0) {
      console.log('Pending migrations:');
      for (const name of pendingMigrations) {
        console.log(` - ${name}`);
      }
    } else {
      console.log('No pending migrations.');
    }
  } catch (error) {
    console.error('Error checking migration status:', error);
    process.exit(1);
  }
}

main();
