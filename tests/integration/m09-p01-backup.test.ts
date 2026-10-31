import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { migrateUp } from '@finance-hub/database';

describe('M09-P01 real PostgreSQL backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-backup-test-'));
  const bin = join(root, 'bin');
  const output = join(root, 'databases', 'finance-hub', 'local');
  const script = resolve('scripts/backup/finance-hub-dump.sh');
  const database = `finance_test_${randomUUID().replaceAll('-', '')}`;
  let container: Awaited<ReturnType<GenericContainer['start']>>;
  let pool: Pool;
  let containerId: string;
  let env: NodeJS.ProcessEnv;
  beforeAll(async () => {
    mkdirSync(bin);
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_USER: 'test_admin',
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: database,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    containerId = container.getId();
    const connectionString = `postgresql://test_admin:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`;
    pool = new Pool({ connectionString });
    await migrateUp({ connectionString });
    await pool.query(
      'INSERT INTO books (id, name, normalized_name, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())',
      [randomUUID(), 'Restore proof', 'restore proof', 'BRL'],
    );
    await pool.query('CREATE TABLE proof (value text NOT NULL)');
    await pool.query("INSERT INTO proof VALUES ('expected')");
    await pool.query('CREATE DATABASE second_database');
    writeFileSync(join(root, 'pgpass'), `*:*:*:test_admin:${password}\n`, { mode: 0o600 });
    writeFileSync(
      join(bin, 'pg_dump'),
      `#!/bin/sh\nexec docker exec -i ${containerId} pg_dump -U test_admin "$@"\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(bin, 'pg_restore'),
      `#!/bin/sh\nif [ "$1" = '--list' ]; then cat "$2" | docker exec -i ${containerId} pg_restore --list; else exit 2; fi\n`,
      { mode: 0o700 },
    );
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: database,
      PGHOST: 'localhost',
      PGPORT: '5432',
      PGUSER: 'test_admin',
      PGPASSFILE: join(root, 'pgpass'),
    };
    delete env.PGPASSWORD;
    delete env.DATABASE_URL;
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
    rmSync(root, { recursive: true, force: true });
  });
  const run = (db = database, environment = 'local') =>
    spawnSync('bash', [script, environment, db], { env, encoding: 'utf8' });

  it('creates an inspected custom dump, integrity manifest, and restorable isolated copy', async () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(env.PGPASSFILE);
    const files = readdirSync(output);
    const dump = files.find((name) => name.endsWith('.dump'))!;
    const manifest = files.find((name) => name.endsWith('.sha256.json'))!;
    const bytes = readFileSync(join(output, dump));
    expect(bytes.subarray(0, 5).toString()).toBe('PGDMP');
    expect(JSON.parse(readFileSync(join(output, manifest), 'utf8')).sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(statSync(join(output, dump)).mode & 0o777).toBe(0o600);
    expect(statSync(join(output, manifest)).mode & 0o777).toBe(0o600);
    execFileSync('docker', [
      'exec',
      containerId,
      'createdb',
      '-U',
      'test_admin',
      'restored_database',
    ]);
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        containerId,
        'pg_restore',
        '-U',
        'test_admin',
        '-d',
        'restored_database',
        '--no-owner',
        '--no-privileges',
      ],
      { input: bytes },
    );
    const restored = execFileSync('docker', [
      'exec',
      containerId,
      'psql',
      '-U',
      'test_admin',
      '-d',
      'restored_database',
      '-Atc',
      'SELECT value FROM proof',
    ])
      .toString()
      .trim();
    expect(restored).toBe('expected');
    expect(
      execFileSync('docker', [
        'exec',
        containerId,
        'psql',
        '-U',
        'test_admin',
        '-d',
        'restored_database',
        '-Atc',
        "SELECT name FROM books WHERE normalized_name='restore proof'",
      ])
        .toString()
        .trim(),
    ).toBe('Restore proof');
    expect((await pool.query('SELECT value FROM proof')).rows[0].value).toBe('expected');
    expect(
      execFileSync('docker', [
        'exec',
        containerId,
        'psql',
        '-U',
        'test_admin',
        '-d',
        'second_database',
        '-Atc',
        "SELECT count(*) FROM pg_tables WHERE tablename='proof'",
      ])
        .toString()
        .trim(),
    ).toBe('0');
  });

  it('rejects unexpected and Production targets without publishing', () => {
    const initial = readdirSync(output);
    expect(run('second_database').status).not.toBe(0);
    expect(run(database, 'production').status).not.toBe(0);
    expect(run('finance_hub_prod').status).not.toBe(0);
    expect(readdirSync(output)).toEqual(initial);
  });

  it('rejects an invalid archive and clears only its staging', () => {
    const initial = readdirSync(output);
    const original = readFileSync(join(bin, 'pg_dump'), 'utf8');
    writeFileSync(
      join(bin, 'pg_dump'),
      `#!/bin/sh\ndocker exec -i ${containerId} pg_dump -U test_admin "$@" | head -c 5\n`,
      { mode: 0o700 },
    );
    try {
      expect(run().status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
    } finally {
      writeFileSync(join(bin, 'pg_dump'), original, { mode: 0o700 });
    }
  });

  it('leaves no artifact when staging is not writable', () => {
    const initial = readdirSync(output);
    chmodSync(output, 0o500);
    try {
      expect(run().status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
    } finally {
      chmodSync(output, 0o700);
    }
  });

  it('cleans owned staging after a terminated dump', () => {
    const initial = readdirSync(output);
    const original = readFileSync(join(bin, 'pg_dump'), 'utf8');
    writeFileSync(join(bin, 'pg_dump'), '#!/bin/sh\nkill -TERM "$PPID"\n', { mode: 0o700 });
    try {
      expect(run().status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
    } finally {
      writeFileSync(join(bin, 'pg_dump'), original, { mode: 0o700 });
    }
  });
});
