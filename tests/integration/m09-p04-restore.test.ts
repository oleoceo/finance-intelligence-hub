import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import { buildApp } from '../../apps/api/src/index.js';
import { migrateUp } from '@finance-hub/database';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('M09-P04 isolated PostgreSQL restore', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-restore-test-'));
  const bin = join(root, 'bin');
  const output = join(root, 'databases', 'finance-hub', 'local');
  const source = `finance_source_${randomUUID().replaceAll('-', '')}`;
  const target = `finance_restore_${randomUUID().replaceAll('-', '')}`;
  const other = `finance_other_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  const book = randomUUID();
  const sender = randomUUID();
  const account = randomUUID();
  const secondAccount = randomUUID();
  const headers = { authorization: 'Bearer restore-admin' };
  const bootstrap = resolve('packages/database/roles/bootstrap.sql');
  let container: Awaited<ReturnType<GenericContainer['start']>>;
  let admin: Pool;
  let restored: Pool;
  let originalApp: ReturnType<typeof buildApp>;
  let restoredApp: ReturnType<typeof buildApp>;
  let artifact: string;
  let env: NodeJS.ProcessEnv;
  let expenseId: string;
  let refundId: string;
  let replayKey: string;
  let replayBody: object;
  let durationMs = 0;
  const url = (database: string, user = 'restore_admin', pass = password) =>
    `postgresql://${user}:${pass}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`;
  const appFor = (database: string) => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url(database);
    try {
      return buildApp({
        adminToken: 'restore-admin',
        ingestToken: 'restore-ingest',
        now: () => new Date('2026-10-21T12:00:00Z'),
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  };
  const call = (
    app: ReturnType<typeof buildApp>,
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
    key?: string,
  ) =>
    app.inject({
      method,
      url: path,
      headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) },
      payload,
    });
  const restore = (database = target, file = artifact, extra: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [resolve('scripts/backup/finance-hub-restore.sh'), file, database], {
      env: {
        ...env,
        FINANCE_RESTORE_ALLOWED_DATABASE: target,
        FINANCE_RESTORE_SOURCE_DATABASE: source,
        FINANCE_RESTORE_BOOTSTRAP: bootstrap,
        ...extra,
      },
      encoding: 'utf8',
    });
  const snapshot = async (pool: Pool) => {
    const tables = [
      'books',
      'accounts',
      'authorized_senders',
      'transactions',
      'audit_events',
      'inbox_messages',
      'idempotency_keys',
    ];
    const result: Record<string, unknown[]> = {};
    for (const table of tables)
      result[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
    return result;
  };
  beforeAll(async () => {
    mkdirSync(bin);
    mkdirSync(output, { recursive: true, mode: 0o700 });
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_USER: 'restore_admin',
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: source,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    admin = new Pool({ connectionString: url(source) });
    await migrateUp({ connectionString: url(source) });
    await admin.query(`CREATE DATABASE ${target}`);
    await admin.query(`CREATE DATABASE ${other}`);
    await admin.query(
      'INSERT INTO books (id,name,normalized_name,currency,timezone,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,true,now(),now())',
      [book, 'Restore book', 'restore book', 'BRL', 'America/Sao_Paulo'],
    );
    for (const [id, name] of [
      [account, 'Source'],
      [secondAccount, 'Destination'],
    ])
      await admin.query(
        'INSERT INTO accounts (id,book_id,name,normalized_name,type,currency,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())',
        [id, book, name, name.toLowerCase(), 'checking', 'BRL'],
      );
    await admin.query(
      'INSERT INTO authorized_senders (id,channel,sender_reference,default_book_id,default_account_id,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,true,now(),now())',
      [sender, 'whatsapp', 'synthetic-sender', book, account],
    );
    for (const status of ['processed', 'failed']) {
      await admin.query(
        'INSERT INTO inbox_messages (id,source,source_instance,source_message_id,sender_reference,authorized_sender_id,raw_text,received_at,processing_status,attempt_count,correlation_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,now(),now())',
        [
          randomUUID(),
          'evolution',
          'synthetic-instance',
          randomUUID(),
          'synthetic-sender',
          sender,
          'synthetic only',
          status,
          status === 'failed' ? 2 : 1,
          randomUUID(),
        ],
      );
    }
    originalApp = appFor(source);
    await originalApp.ready();
    const create = async (body: object, key = randomUUID()) => {
      const response = await call(originalApp, 'POST', '/api/v1/transactions', body, key);
      expect(response.statusCode).toBe(201);
      return response.json().data.id as string;
    };
    replayKey = randomUUID();
    replayBody = {
      book_id: book,
      account_id: account,
      type: 'expense',
      amount: '500.00',
      transaction_date: '2026-10-20',
      description: 'synthetic expense',
    };
    expenseId = await create(replayBody, replayKey);
    await create({
      book_id: book,
      account_id: account,
      type: 'income',
      amount: '100.10',
      transaction_date: '2026-10-20',
      description: 'synthetic income',
    });
    await create({
      book_id: book,
      account_id: account,
      destination_account_id: secondAccount,
      type: 'transfer',
      amount: '20.00',
      transaction_date: '2026-10-20',
      description: 'synthetic transfer',
    });
    const refund = await call(
      originalApp,
      'POST',
      `/api/v1/transactions/${expenseId}/refunds`,
      {
        version: 1,
        amount: '200.00',
        account_id: account,
        transaction_date: '2026-10-20',
        description: 'synthetic refund',
      },
      randomUUID(),
    );
    expect(refund.statusCode).toBe(201);
    refundId = refund.json().data.id;
    const voidedId = await create({
      book_id: book,
      account_id: account,
      type: 'expense',
      amount: '7.00',
      transaction_date: '2026-10-20',
      description: 'synthetic voided expense',
    });
    const voided = await call(
      originalApp,
      'POST',
      `/api/v1/transactions/${voidedId}/void`,
      { version: 1, reason: 'synthetic reversal' },
      randomUUID(),
    );
    expect(voided.statusCode).toBe(200);
    writeFileSync(join(root, 'pgpass'), `*:*:*:restore_admin:${password}\n`, { mode: 0o600 });
    for (const command of ['pg_dump', 'pg_restore', 'psql']) {
      writeFileSync(
        join(bin, command),
        `#!/bin/sh\nexec docker run --rm --network host -v '${root}:${root}:ro' -v '${resolve('packages/database/roles')}:${resolve('packages/database/roles')}:ro' -e PGHOST -e PGPORT -e PGUSER -e PGPASSFILE -e PGCONNECT_TIMEOUT postgres:18.6-bookworm ${command} "$@"\n`,
        { mode: 0o700 },
      );
    }
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: source,
      PGHOST: container.getHost(),
      PGPORT: String(container.getMappedPort(5432)),
      PGUSER: 'restore_admin',
      PGPASSFILE: join(root, 'pgpass'),
    };
    delete env.PGPASSWORD;
    delete env.DATABASE_URL;
    const dump = spawnSync(
      'bash',
      [resolve('scripts/backup/finance-hub-dump.sh'), 'local', source],
      { env, encoding: 'utf8' },
    );
    expect(dump.status, dump.stderr).toBe(0);
    artifact = join(output, readdirSync(output)[0]);
  }, 180_000);
  afterAll(async () => {
    await restoredApp?.close();
    await originalApp?.close();
    await restored?.end();
    await admin?.end();
    await container?.stop();
    rmSync(root, { recursive: true, force: true });
  });
  it('validates manifest, restores to empty isolated target, and preserves exact SQL and API results', async () => {
    const bytes = readFileSync(join(artifact, 'archive.dump'));
    const manifest = JSON.parse(readFileSync(join(artifact, 'manifest.json'), 'utf8'));
    expect(manifest.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const before = await snapshot(admin);
    const routes = [
      `/api/v1/transactions/${expenseId}`,
      `/api/v1/transactions/${expenseId}/refunds`,
      `/api/v1/transactions/${expenseId}/audit`,
      `/api/v1/reports/summary?book_id=${book}`,
    ];
    const responses = await Promise.all(
      routes.map(async (path) => (await call(originalApp, 'GET', path)).json().data),
    );
    const started = performance.now();
    const result = restore();
    durationMs = Math.round(performance.now() - started);
    expect(result.status, result.stderr).toBe(0);
    console.info(`M09-P04 local isolated restore elapsed_ms=${durationMs}`);
    expect(`${result.stdout}${result.stderr}`).not.toContain(password);
    restored = new Pool({ connectionString: url(target) });
    expect(await snapshot(restored)).toEqual(before);
    expect((await migrateUp({ connectionString: url(target) })).results).toEqual([]);
    const roles = (
      await restored.query(
        "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('finance_hub_app','finance_hub_migrations') ORDER BY rolname",
      )
    ).rows;
    expect(roles).toEqual([
      { rolname: 'finance_hub_app', rolsuper: false, rolcreatedb: false, rolcreaterole: false },
      {
        rolname: 'finance_hub_migrations',
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
      },
    ]);
    expect(
      (await restored.query("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'"))
        .rows,
    ).toEqual([{ tableowner: 'finance_hub_migrations' }]);
    expect(
      (
        await restored.query(
          "SELECT has_schema_privilege('finance_hub_app','public','CREATE') AS can_create, has_table_privilege('finance_hub_app','audit_events','UPDATE') AS can_update_audit",
        )
      ).rows[0],
    ).toEqual({ can_create: false, can_update_audit: false });
    const appPassword = randomUUID();
    await restored.query(`ALTER ROLE finance_hub_app PASSWORD '${appPassword}'`);
    const appRole = new Pool({ connectionString: url(target, 'finance_hub_app', appPassword) });
    try {
      await expect(appRole.query('CREATE ROLE restore_forbidden')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(appRole.query(readFileSync(bootstrap, 'utf8'))).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await appRole.end();
    }
    const unrelated = new Pool({ connectionString: url(other) });
    try {
      expect(
        (await unrelated.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0]
          .count,
      ).toBe('0');
    } finally {
      await unrelated.end();
    }
    expect((await admin.query('SELECT count(*) FROM transactions')).rows[0].count).toBe('5');
    expect(
      (
        await restored.query(
          'SELECT status,count(*)::int AS count FROM transactions GROUP BY status ORDER BY status',
        )
      ).rows,
    ).toEqual([
      { status: 'posted', count: 4 },
      { status: 'voided', count: 1 },
    ]);
    expect(
      (
        await restored.query(
          'SELECT amount::text, refund_of_transaction_id FROM transactions WHERE id=$1',
          [refundId],
        )
      ).rows[0],
    ).toEqual({ amount: '200.00', refund_of_transaction_id: expenseId });
    restoredApp = appFor(target);
    await restoredApp.ready();
    for (const [index, path] of routes.entries()) {
      const response = await call(restoredApp, 'GET', path);
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(responses[index]);
    }
    expect(responses[3]).toMatchObject({
      ordinary_income: '100.10',
      gross_expenses: '500.00',
      refunds: '200.00',
      net_expenses: '300.00',
      net: '-199.90',
    });
    expect(
      (await call(restoredApp, 'POST', '/api/v1/transactions', replayBody, replayKey)).json().data
        .id,
    ).toBe(expenseId);
    expect(await snapshot(admin)).toEqual(before);
    expect(durationMs).toBeGreaterThan(0);
  }, 120_000);
  it('rejects reused, source, unrelated, corrupt, and truncated targets without success', async () => {
    expect(restore().status).not.toBe(0);
    expect(restore(source).status).not.toBe(0);
    expect(restore(other).status).not.toBe(0);
    const bad = join(root, 'bad');
    mkdirSync(bad);
    writeFileSync(join(bad, 'manifest.json'), readFileSync(join(artifact, 'manifest.json')));
    writeFileSync(
      join(bad, 'archive.dump'),
      readFileSync(join(artifact, 'archive.dump')).subarray(0, 100),
    );
    expect(restore(target, bad).status).not.toBe(0);
    expect((await admin.query('SELECT count(*) FROM transactions')).rows[0].count).toBe('5');
  });
  it('reports an interrupted pg_restore as failure and leaves source and independent database intact', async () => {
    const interrupted = `finance_restore_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${interrupted}`);
    const wrapper = join(root, 'interrupt-bin');
    mkdirSync(wrapper);
    writeFileSync(
      join(wrapper, 'pg_restore'),
      `#!/bin/sh\nif [ "$1" = "--list" ]; then exec '${join(bin, 'pg_restore')}' "$@"; fi\nexit 143\n`,
      { mode: 0o700 },
    );
    const before = await snapshot(admin);
    const result = restore(interrupted, artifact, {
      FINANCE_RESTORE_ALLOWED_DATABASE: interrupted,
      PATH: `${wrapper}:${env.PATH}`,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('complete');
    expect(result.stderr).toContain('pg_restore failed');
    expect(`${result.stdout}${result.stderr}`).not.toContain(password);
    expect(await snapshot(admin)).toEqual(before);
    const unrelated = new Pool({ connectionString: url(other) });
    try {
      expect(
        (await unrelated.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0]
          .count,
      ).toBe('0');
    } finally {
      await unrelated.end();
    }
  }, 30_000);
});
