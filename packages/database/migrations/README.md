# Migration Conventions

## Directory Structure

Migrations live in `packages/database/migrations/` as TypeScript files.

## Naming Convention

Files use the pattern `<sequence>_<description>.ts`:

```
001_technical_validation.ts
002_another_migration.ts
```

Sequence numbers are zero-padded to 3 digits for deterministic ordering.

## TypeScript Build Considerations

Migrations are compiled by the package's TypeScript build and output to `dist/migrations/`.
The migration runner loads compiled `.js` files from `dist/migrations/`.

## Migration Format

Each migration exports two functions:

```typescript
export async function up(kysely: Kysely<unknown>): Promise<void> {
  // Apply migration
}

export async function down(kysely: Kysely<unknown>): Promise<void> {
  // Rollback migration
}
```

## Running Migrations

Use the migration scripts defined in `packages/database/package.json`:

```bash
pnpm migrate:up      # Apply pending migrations
pnpm migrate:down    # Rollback last migration
pnpm migrate:status  # Show migration status
```

## Technical Validation Migration

Migration `001_technical_validation.ts` is a no-op migration that proves the
framework works without creating permanent application tables. It does not
create domain schema. Domain migrations begin in M02.