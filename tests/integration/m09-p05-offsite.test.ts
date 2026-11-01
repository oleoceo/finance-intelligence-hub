import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { migrateUp } from '@finance-hub/database';

describe('M09-P05 Finance Lab encrypted remote recovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-lab-p05-'));
  const bin = join(root, 'bin');
  const output = join(root, 'databases', 'finance-hub', 'lab');
  const repository = join(root, 'repository');
  const recoveredRepo = join(root, 'recovered-repository');
  const staging = join(root, 'staging');
  const remote = join(root, 'drive');
  const passwordFile = join(root, 'restic-password');
  const configFile = join(root, 'rclone.conf');
  const database = 'finance_hub_lab';
  const password = randomUUID();
  const bookId = randomUUID();
  const accountId = randomUUID();
  const script = resolve('scripts/backup/finance-hub-lab-offsite.sh');
  const dumpScript = resolve('scripts/backup/finance-hub-lab-dump.sh');
  const fingerprintScript = resolve('scripts/backup/finance-hub-lab-fingerprint.sh');
  const restoreScript = resolve('scripts/backup/finance-hub-lab-restore.sh');
  let container: Awaited<ReturnType<GenericContainer['start']>>;
  let recoveryContainer: Awaited<ReturnType<GenericContainer['start']>>;
  let artifact: string;
  let env: NodeJS.ProcessEnv;
  let sourceFingerprint: string;
  const run = (mode: string, input: string, extra: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [script, mode, input], { env: { ...env, ...extra }, encoding: 'utf8' });
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const files = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    });

  beforeAll(async () => {
    for (const dir of [bin, output, repository, recoveredRepo, staging, remote])
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(passwordFile, password, { mode: 0o600 });
    writeFileSync(configFile, `[finance-drive]\ntype = alias\nremote = ${remote}\n`, {
      mode: 0o600,
    });
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
    const admin = new Pool({
      connectionString: `postgresql://test_admin:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`,
    });
    try {
      await migrateUp({
        connectionString: `postgresql://test_admin:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`,
      });
      await admin.query(
        'INSERT INTO books (id,name,normalized_name,currency,timezone,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,true,now(),now())',
        [bookId, 'P05 Finance Lab', 'p05 finance lab', 'BRL', 'America/Sao_Paulo'],
      );
      await admin.query(
        'INSERT INTO accounts (id,book_id,name,normalized_name,type,currency,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())',
        [accountId, bookId, 'P05 account', 'p05 account', 'checking', 'BRL'],
      );
      await admin.query(`CREATE ROLE finance_backup_ro LOGIN PASSWORD '${password}'`);
      await admin.query('GRANT USAGE ON SCHEMA public TO finance_backup_ro');
      await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO finance_backup_ro');
    } finally {
      await admin.end();
    }
    writeFileSync(join(root, 'pgpass'), `*:*:*:finance_backup_ro:${password}\n`, { mode: 0o600 });
    writeFileSync(join(root, 'pgpass-admin'), `*:*:*:test_admin:${password}\n`, { mode: 0o600 });
    const wrapper = (name: string, image: string) =>
      writeFileSync(
        join(bin, name),
        `#!/bin/sh\nif [ "$PGHOST" = postgres-products ]; then PGHOST='${container.getHost()}'; PGPORT='${container.getMappedPort(5432)}'; export PGHOST PGPORT; fi\nexec docker run --rm --user "$(id -u):$(id -g)" --network host -v '${root}:${root}' -v '${resolve('packages/database/roles')}:${resolve('packages/database/roles')}:ro' -e PGHOST -e PGPORT -e PGUSER -e PGPASSFILE -e PGCONNECT_TIMEOUT -e RESTIC_REPOSITORY -e RESTIC_PASSWORD_FILE -e RCLONE_CONFIG ${image} ${name === 'pg_dump' || name === 'pg_restore' || name === 'psql' ? name : ''} "$@"\n`,
        { mode: 0o700 },
      );
    wrapper('pg_dump', 'postgres:18.6-bookworm');
    wrapper('pg_restore', 'postgres:18.6-bookworm');
    wrapper('psql', 'postgres:18.6-bookworm');
    wrapper('restic', 'restic/restic:0.18.1');
    wrapper('rclone', 'rclone/rclone:1.72.0');
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: database,
      PGHOST: 'postgres-products',
      PGPORT: '5432',
      PGUSER: 'finance_backup_ro',
      PGPASSFILE: join(root, 'pgpass'),
      FINANCE_RESTIC_REPOSITORY: repository,
      FINANCE_RCLONE_REMOTE: 'finance-drive:FinanceHub-Backups/finance-lab-p05/test',
      RESTIC_PASSWORD_FILE: passwordFile,
      RCLONE_CONFIG_FILE: configFile,
      FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD: 'yes',
    };
    for (const key of [
      'PGPASSWORD',
      'DATABASE_URL',
      'RESTIC_PASSWORD',
      'RESTIC_PASSWORD_COMMAND',
      'RCLONE_CONFIG',
    ])
      delete env[key];
    const fingerprint = spawnSync('bash', [fingerprintScript, 'source'], {
      env,
      encoding: 'utf8',
    });
    expect(fingerprint.status, fingerprint.stderr).toBe(0);
    sourceFingerprint = fingerprint.stdout;
    const dump = spawnSync('bash', [dumpScript], { env, encoding: 'utf8' });
    expect(dump.status, dump.stderr).toBe(0);
    artifact = join(output, readdirSync(output)[0]);
  }, 120_000);
  afterAll(async () => {
    await recoveryContainer?.stop();
    await container?.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects unauthorized targets and exposed secrets before remote transfer', () => {
    expect(
      run('protect', artifact, { FINANCE_RCLONE_REMOTE: 'finance-drive:Other' }).status,
    ).not.toBe(0);
    expect(run('protect', artifact, { RESTIC_PASSWORD: 'inline' }).status).not.toBe(0);
    expect(
      run('protect', artifact, { FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD: 'no' }).status,
    ).not.toBe(0);
    expect(run('protect', artifact, { FINANCE_BACKUP_ROOT: staging }).status).not.toBe(0);
    expect(run('protect', artifact, { FINANCE_RESTIC_REPOSITORY: artifact }).status).not.toBe(0);
    expect(readdirSync(repository)).toHaveLength(0);
  });

  it('rejects elevated or wrong source identities before a dump', () => {
    const elevated = spawnSync('bash', [dumpScript], {
      env: { ...env, PGUSER: 'test_admin', PGPASSFILE: join(root, 'pgpass-admin') },
      encoding: 'utf8',
    });
    expect(elevated.status).not.toBe(0);
    const wrongHost = spawnSync('bash', [dumpScript], {
      env: { ...env, PGHOST: 'other-postgres' },
      encoding: 'utf8',
    });
    expect(wrongHost.status).not.toBe(0);
    expect(readdirSync(output)).toHaveLength(1);
  });

  it('rejects altered manifest or archive', () => {
    const manifest = join(artifact, 'manifest.json');
    const original = readFileSync(manifest);
    writeFileSync(manifest, original.toString().replace('finance_hub_lab', 'finance_hub_prod'));
    expect(run('protect', artifact).status).not.toBe(0);
    writeFileSync(manifest, original);
    expect(readdirSync(repository)).toHaveLength(0);
  });

  it('rejects source-host and preexisting restore-instance targets', () => {
    const base = {
      ...env,
      FINANCE_RESTORE_ALLOWED_DATABASE: 'finance_restore_p05',
      FINANCE_RESTORE_SOURCE_DATABASE: 'finance_hub_lab',
      FINANCE_RESTORE_SOURCE_ENVIRONMENT: 'lab',
      FINANCE_SOURCE_PGHOST: 'postgres-products',
      FINANCE_RECOVERY_INSTANCE: 'finance-hub-p05-restore-test',
    };
    const invoke = (extra: NodeJS.ProcessEnv) =>
      spawnSync('bash', [restoreScript, artifact, 'finance_restore_p05'], {
        env: { ...base, ...extra },
        encoding: 'utf8',
      });
    expect(invoke({ PGHOST: 'postgres-products' }).status).not.toBe(0);
    expect(
      invoke({ PGHOST: 'isolated', FINANCE_RECOVERY_INSTANCE: 'finance-hub-restore-test' }).status,
    ).not.toBe(0);
    expect(
      invoke({ PGHOST: 'isolated', FINANCE_RESTORE_ALLOWED_DATABASE: 'finance_restore_other' })
        .status,
    ).not.toBe(0);
  });

  it('fingerprints financial rows without exposing data or accepting the source as target', () => {
    const after = spawnSync('bash', [fingerprintScript, 'source'], { env, encoding: 'utf8' });
    expect(after.status, after.stderr).toBe(0);
    expect(after.stdout).toBe(sourceFingerprint);
    expect(after.stdout).toMatch(/^books 1 [a-f0-9]{64}$/m);
    expect(after.stdout).toMatch(/^accounts 1 [a-f0-9]{64}$/m);
    expect(after.stdout).not.toContain('P05 Finance Lab');
    const invalid = spawnSync('bash', [fingerprintScript, 'target'], {
      env: { ...env, FINANCE_RESTORE_ALLOWED_DATABASE: 'finance_restore_bad' },
      encoding: 'utf8',
    });
    expect(invalid.status).not.toBe(0);
  }, 120_000);

  it('protects only encrypted objects and independently recovers the exact dump', async () => {
    const protectedResult = run('protect', artifact);
    expect(protectedResult.status, protectedResult.stderr).toBe(0);
    expect(protectedResult.stdout + protectedResult.stderr).not.toContain(password);
    expect(protectedResult.stdout).toContain('transfer_seconds=');
    const recovered = run('recover', staging, { FINANCE_RESTIC_REPOSITORY: recoveredRepo });
    expect(recovered.status, recovered.stderr).toBe(0);
    expect(recovered.stdout).toContain('recovery_seconds=');
    const restoredDump = join(staging, artifact.slice(1), 'archive.dump');
    expect(hash(restoredDump)).toBe(hash(join(artifact, 'archive.dump')));
    expect(
      readdirSync(join(remote, 'FinanceHub-Backups', 'finance-lab-p05', 'test')).sort(),
    ).toEqual(['config', 'data', 'index', 'keys', 'snapshots']);
    expect(readdirSync(recoveredRepo)).toContain('config');
    const source = new Pool({
      connectionString: `postgresql://test_admin:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`,
    });
    try {
      const book = await source.query('SELECT id,currency FROM books WHERE id=$1', [bookId]);
      const account = await source.query('SELECT id,book_id,currency FROM accounts WHERE id=$1', [
        accountId,
      ]);
      expect(book.rows).toEqual([{ id: bookId, currency: 'BRL' }]);
      expect(account.rows).toEqual([{ id: accountId, book_id: bookId, currency: 'BRL' }]);
    } finally {
      await source.end();
    }
    const unchanged = spawnSync('bash', [fingerprintScript, 'source'], {
      env,
      encoding: 'utf8',
    });
    expect(unchanged.status, unchanged.stderr).toBe(0);
    expect(unchanged.stdout).toBe(sourceFingerprint);
    recoveryContainer = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_USER: 'restore_admin',
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: 'postgres',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    const recoveryPort = recoveryContainer.getMappedPort(5432);
    const recoveryHost = recoveryContainer.getHost();
    const recoveryAdmin = new Pool({
      connectionString: `postgresql://restore_admin:${password}@${recoveryHost}:${recoveryPort}/postgres`,
    });
    try {
      await recoveryAdmin.query('CREATE DATABASE finance_restore_p05');
    } finally {
      await recoveryAdmin.end();
    }
    writeFileSync(join(root, 'pgpass-recovery'), `*:*:*:restore_admin:${password}\n`, {
      mode: 0o600,
    });
    const targetEnv = {
      ...env,
      PGHOST: recoveryHost,
      PGPORT: String(recoveryPort),
      PGUSER: 'restore_admin',
      PGPASSFILE: join(root, 'pgpass-recovery'),
      FINANCE_RESTORE_ALLOWED_DATABASE: 'finance_restore_p05',
      FINANCE_RESTORE_SOURCE_DATABASE: 'finance_hub_lab',
      FINANCE_RESTORE_SOURCE_ENVIRONMENT: 'lab',
      FINANCE_RESTORE_BOOTSTRAP: resolve('packages/database/roles/bootstrap.sql'),
      FINANCE_SOURCE_PGHOST: 'postgres-products',
      FINANCE_RECOVERY_INSTANCE: 'finance-hub-p05-restore-test',
    };
    const restored = spawnSync(
      'bash',
      [restoreScript, join(staging, artifact.slice(1)), 'finance_restore_p05'],
      { env: targetEnv, encoding: 'utf8' },
    );
    expect(restored.status, restored.stderr).toBe(0);
    const targetFingerprint = spawnSync('bash', [fingerprintScript, 'target'], {
      env: targetEnv,
      encoding: 'utf8',
    });
    expect(targetFingerprint.status, targetFingerprint.stderr).toBe(0);
    expect(targetFingerprint.stdout.split('\n').slice(1)).toEqual(
      sourceFingerprint.split('\n').slice(1),
    );
    for (const file of files(join(remote, 'FinanceHub-Backups', 'finance-lab-p05', 'test'))) {
      const contents = readFileSync(file);
      expect(contents.includes(Buffer.from('PGDMP')), file).toBe(false);
      expect(contents.includes(Buffer.from(database)), file).toBe(false);
      expect(contents.includes(Buffer.from(password)), file).toBe(false);
    }
  }, 180_000);
});
