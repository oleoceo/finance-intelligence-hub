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
      `#!/bin/sh\nexec docker run --rm --network host -v '${root}:${root}:ro' -e PGHOST -e PGPORT -e PGUSER -e PGPASSFILE -e PGCONNECT_TIMEOUT postgres:18.6-bookworm pg_dump "$@"\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(bin, 'pg_restore'),
      `#!/bin/sh\nexec docker run --rm --network host -v '${root}:${root}:ro' postgres:18.6-bookworm pg_restore "$@"\n`,
      { mode: 0o700 },
    );
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: database,
      PGHOST: container.getHost(),
      PGPORT: String(container.getMappedPort(5432)),
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
    expect(files).toHaveLength(1);
    const artifact = join(output, files[0]);
    const bytes = readFileSync(join(artifact, 'archive.dump'));
    expect(bytes.subarray(0, 5).toString()).toBe('PGDMP');
    expect(JSON.parse(readFileSync(join(artifact, 'manifest.json'), 'utf8')).sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(statSync(join(artifact, 'archive.dump')).mode & 0o777).toBe(0o600);
    expect(statSync(join(artifact, 'manifest.json')).mode & 0o777).toBe(0o600);
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
  }, 30_000);

  it('rejects unexpected and Production targets without publishing', () => {
    const initial = readdirSync(output);
    expect(run('second_database').status).not.toBe(0);
    expect(run(database, 'production').status).not.toBe(0);
    expect(run('finance_hub_prod').status).not.toBe(0);
    expect(readdirSync(output)).toEqual(initial);
  });

  it('uses the external host, port and password file and ignores inherited libpq redirects', async () => {
    const initial = readdirSync(output);
    for (const change of [
      { PGHOST: 'invalid.finance.test' },
      { PGPORT: '1' },
      { PGPASSFILE: join(root, 'wrong-pgpass') },
    ]) {
      if (change.PGPASSFILE) {
        writeFileSync(change.PGPASSFILE, '*:*:*:test_admin:wrong-password\n', { mode: 0o600 });
      }
      const result = spawnSync('bash', [script, 'local', database], {
        env: { ...env, ...change },
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
    }
    expect((await pool.query('SELECT value FROM proof')).rows[0].value).toBe('expected');
    expect(
      (await pool.query("SELECT datname FROM pg_database WHERE datname='second_database'"))
        .rowCount,
    ).toBe(1);
    const redirected = spawnSync('bash', [script, 'local', database], {
      env: {
        ...env,
        PGHOSTADDR: '127.0.0.2',
        PGSERVICE: 'invalid-service',
        PGDATABASE: 'second_database',
      },
      encoding: 'utf8',
    });
    expect(redirected.status).toBe(0);
  }, 30_000);

  it('publishes only a complete directory when interrupted at publication', () => {
    const initial = readdirSync(output);
    writeFileSync(join(bin, 'mv'), '#!/bin/sh\nkill -TERM "$PPID"\nexit 1\n', { mode: 0o700 });
    try {
      expect(run().status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
      for (const name of initial) {
        expect(readdirSync(join(output, name))).toEqual(['archive.dump', 'manifest.json']);
      }
    } finally {
      rmSync(join(bin, 'mv'));
    }
  }, 30_000);

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

  it('rejects an empty archive after a real pg_dump invocation', () => {
    const initial = readdirSync(output);
    const original = readFileSync(join(bin, 'pg_dump'), 'utf8');
    writeFileSync(
      join(bin, 'pg_dump'),
      `#!/bin/sh\ndocker exec -i ${containerId} pg_dump -U test_admin "$@" >/dev/null\n`,
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
    writeFileSync(
      join(bin, 'pg_dump'),
      `#!/bin/sh\ndocker exec -i ${containerId} pg_dump -U test_admin "$@" | head -c 100\nkill -TERM "$PPID"\n`,
      { mode: 0o700 },
    );
    try {
      expect(run().status).not.toBe(0);
      expect(readdirSync(output)).toEqual(initial);
    } finally {
      writeFileSync(join(bin, 'pg_dump'), original, { mode: 0o700 });
    }
  });
});
