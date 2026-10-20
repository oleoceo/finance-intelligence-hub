import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { migrateUp, migrateDown, getMigrationStatus } from '@finance-hub/database';
import { schemaDatabase, chain, insert, named, id, now, rejects } from './schema-helpers.js';

// Real authenticated connections, not superuser sessions with merely inspected ACLs.
describe('M02-T05 database roles', () => {
  const db = schemaDatabase(false);
  const roles = ['finance_hub_migrations', 'finance_hub_app', 'finance_hub_readonly'];
  const bootstrap = readFileSync(
    new URL('../../packages/database/roles/bootstrap.sql', import.meta.url),
    'utf8',
  );
  let migrationUrl: string;
  let migration: Pool;
  let app: Pool;
  let readonly: Pool;
  beforeAll(async () => {
    await db.pool.query(bootstrap);
    const pools: Pool[] = [];
    for (const role of roles) {
      // Generated disposable credentials are assigned only inside this test container.
      const password = randomBytes(24).toString('hex');
      await db.pool.query(`ALTER ROLE ${role} PASSWORD '${password}'`);
      const url = new URL(db.connectionString);
      url.username = role;
      url.password = password;
      if (role === 'finance_hub_migrations') migrationUrl = url.toString();
      pools.push(new Pool({ connectionString: url.toString() }));
    }
    [migration, app, readonly] = pools;
  });
  afterAll(async () => {
    await Promise.all([migration?.end(), app?.end(), readonly?.end()]);
  });

  it('creates LOGIN roles without superuser, database-creation or role-creation authority', async () => {
    const { rows } = await db.pool.query(
      'SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=ANY($1) ORDER BY rolname',
      [roles],
    );
    expect(rows).toHaveLength(3);
    for (const row of rows)
      expect(row).toMatchObject({
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
      });
    for (const [i, pool] of [migration, app, readonly].entries())
      expect((await pool.query('SELECT current_user')).rows[0].current_user).toBe(roles[i]);
    expect(bootstrap).not.toMatch(/PASSWORD\s+['"]/i);
  });
  it('migration role applies the real empty-database 001 through 005 chain and owns tables', async () => {
    expect((await migrateUp({ connectionString: migrationUrl })).results).toEqual(
      chain.map((migrationName) => ({ migrationName, status: 'Success' })),
    );
    const { rows } = await db.pool.query(
      "SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public'",
    );
    expect(rows).toHaveLength(15);
    for (const row of rows) expect(row.tableowner).toBe('finance_hub_migrations');
    // Audit must already be protected BEFORE any post-migration grant reconciliation.
    await rejects(app.query("UPDATE audit_events SET action='forbidden'"), '42501');
    await rejects(app.query('DELETE FROM audit_events'), '42501');
    await rejects(app.query('TRUNCATE audit_events'), '42501');
    await db.pool.query(bootstrap);
    await db.pool.query(bootstrap);
    expect((await migrateUp({ connectionString: migrationUrl })).results).toEqual([]);
  });
  it('app supports business CRUD while readonly only SELECTs; neither can perform DDL', async () => {
    const row = named({ currency: 'BRL' });
    await insert(app, 'books', row);
    expect(
      (await readonly.query('SELECT name FROM books WHERE id=$1', [row.id])).rows[0].name,
    ).toBe(row.name);
    expect(
      (await app.query("UPDATE books SET name='Changed' WHERE id=$1", [row.id])).rowCount,
    ).toBe(1);
    await rejects(insert(readonly, 'books', named({ currency: 'BRL' })), '42501');
    await rejects(
      readonly.query("UPDATE books SET name='forbidden' WHERE id=$1", [row.id]),
      '42501',
    );
    await rejects(readonly.query('DELETE FROM books WHERE id=$1', [row.id]), '42501');
    for (const pool of [app, readonly]) {
      await rejects(pool.query('CREATE TABLE forbidden_table (id integer)'), '42501');
      await rejects(pool.query('ALTER TABLE books ADD COLUMN forbidden integer'), '42501');
      await rejects(pool.query('DROP TABLE audit_events'), '42501');
      await rejects(pool.query('TRUNCATE books'), '42501');
      await rejects(pool.query('SELECT * FROM kysely_migration'), '42501');
    }
    expect((await app.query('DELETE FROM books WHERE id=$1', [row.id])).rowCount).toBe(1);
  });
  it('app can append/read Audit but cannot UPDATE, DELETE or TRUNCATE existing history', async () => {
    const row = {
      id: id(),
      entity_type: 'test',
      entity_id: id(),
      action: 'original',
      source: 'test',
      created_at: now,
    };
    await insert(app, 'audit_events', row);
    expect(
      (await app.query('SELECT action FROM audit_events WHERE id=$1', [row.id])).rows[0].action,
    ).toBe('original');
    await rejects(
      app.query("UPDATE audit_events SET action='forbidden' WHERE id=$1", [row.id]),
      '42501',
    );
    await rejects(app.query('DELETE FROM audit_events WHERE id=$1', [row.id]), '42501');
    await rejects(app.query('TRUNCATE audit_events'), '42501');
    await rejects(insert(readonly, 'audit_events', { ...row, id: id() }), '42501');
    expect(
      (await readonly.query('SELECT action FROM audit_events WHERE id=$1', [row.id])).rows[0]
        .action,
    ).toBe('original');
  });
  it('readonly SELECTs every business table and cannot write any of them', async () => {
    const tables = (
      await db.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'kysely_%'",
      )
    ).rows;
    expect(tables).toHaveLength(13);
    for (const { tablename } of tables) {
      await readonly.query(`SELECT * FROM ${tablename} LIMIT 1`);
      await rejects(readonly.query(`INSERT INTO ${tablename} DEFAULT VALUES`), '42501');
      await rejects(readonly.query(`UPDATE ${tablename} SET id=id WHERE false`), '42501');
      await rejects(readonly.query(`DELETE FROM ${tablename} WHERE false`), '42501');
      await rejects(readonly.query(`TRUNCATE ${tablename}`), '42501');
    }
  });
  it('future migration-owned table inherits app CRUD and readonly SELECT without bootstrap rerun', async () => {
    await migration.query('CREATE TABLE future_grant_probe (id integer PRIMARY KEY, value text)');
    try {
      await app.query("INSERT INTO future_grant_probe VALUES (1,'initial')");
      expect((await readonly.query('SELECT value FROM future_grant_probe')).rows[0].value).toBe(
        'initial',
      );
      await app.query("UPDATE future_grant_probe SET value='changed' WHERE id=1");
      for (const sql of [
        "INSERT INTO future_grant_probe VALUES (2,'forbidden')",
        "UPDATE future_grant_probe SET value='forbidden'",
        'DELETE FROM future_grant_probe',
        'TRUNCATE future_grant_probe',
      ])
        await rejects(readonly.query(sql), '42501');
      await rejects(app.query('TRUNCATE future_grant_probe'), '42501');
      await rejects(app.query('DROP TABLE future_grant_probe'), '42501');
      expect((await app.query('DELETE FROM future_grant_probe WHERE id=1')).rowCount).toBe(1);
    } finally {
      await migration.query('DROP TABLE future_grant_probe');
    }
  });
  it('migration role reverts every canonical migration, no-pending down, then reapplies full chain', async () => {
    for (const migrationName of [...chain].reverse())
      expect((await migrateDown({ connectionString: migrationUrl })).results).toEqual([
        { migrationName, status: 'Success' },
      ]);
    expect((await migrateDown({ connectionString: migrationUrl })).results).toEqual([]);
    const empty = await getMigrationStatus({ connectionString: migrationUrl });
    expect(empty.executedMigrations).toEqual([]);
    expect(empty.pendingMigrations).toEqual(chain);
    expect((await migrateUp({ connectionString: migrationUrl })).results).toEqual(
      chain.map((migrationName) => ({ migrationName, status: 'Success' })),
    );
    expect(
      (await getMigrationStatus({ connectionString: migrationUrl })).executedMigrations.map(
        (m) => m.name,
      ),
    ).toEqual(chain);
    await rejects(app.query("UPDATE audit_events SET action='forbidden'"), '42501');
    await rejects(app.query('DELETE FROM audit_events'), '42501');
    await rejects(app.query('TRUNCATE audit_events'), '42501');
    expect((await app.query('SELECT count(*) FROM outbox_events')).rows[0].count).toBe('0');
  });
});
