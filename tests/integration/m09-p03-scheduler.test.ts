import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  linkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

describe('M09-P03 disposable scheduler and retention', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-p03-'));
  const bin = join(root, 'bin');
  const target = join(root, 'databases', 'finance-hub', 'local');
  const repository = join(root, 'repository');
  const destination = join(root, 'destination');
  const passwordFile = join(root, 'password');
  const database = 'finance_test_p03';
  const script = resolve('scripts/backup/finance-hub-scheduled.sh');
  const statusScript = resolve('scripts/backup/finance-hub-status.sh');
  let env: NodeJS.ProcessEnv;
  const run = (mode = 'daily', changes: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [script, mode], {
      env: { ...env, ...changes },
      encoding: 'utf8',
      timeout: 120_000,
    });
  const docker = (image: string, args: string[], extra: string[] = []) =>
    spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '-v',
        `${root}:${root}`,
        ...extra,
        image,
        ...args,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );
  const snapshots = () => {
    const result = docker(
      'restic/restic:0.18.1',
      ['snapshots', '--json'],
      ['-e', `RESTIC_REPOSITORY=${repository}`, '-e', `RESTIC_PASSWORD_FILE=${passwordFile}`],
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as Array<{ id: string; time: string }>;
  };

  beforeAll(() => {
    mkdirSync(bin);
    mkdirSync(target, { recursive: true, mode: 0o700 });
    mkdirSync(repository, { mode: 0o700 });
    mkdirSync(destination, { mode: 0o700 });
    writeFileSync(join(root, '.finance-backup-test-fixture'), 'owned');
    writeFileSync(passwordFile, randomUUID(), { mode: 0o600 });
    writeFileSync(join(root, 'pgpass'), 'fixture', { mode: 0o600 });
    writeFileSync(join(bin, 'pg_dump'), '#!/bin/sh\nprintf PGDMPsynthetic-fixture\n', {
      mode: 0o700,
    });
    writeFileSync(join(bin, 'pg_restore'), '#!/bin/sh\nprintf "fixture archive listing\\n"\n', {
      mode: 0o700,
    });
    writeFileSync(
      join(bin, 'restic'),
      `#!/bin/sh\nexec docker run --rm --user "$(id -u):$(id -g)" -v '${root}:${root}' -e RESTIC_REPOSITORY -e RESTIC_PASSWORD_FILE restic/restic:0.18.1 "$@"\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(bin, 'rclone'),
      `#!/bin/sh\nexec docker run --rm --user "$(id -u):$(id -g)" -v '${root}:${root}' rclone/rclone:1.72.0 "$@"\n`,
      { mode: 0o700 },
    );
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_BACKUP_FIXTURE_ONLY: 'yes',
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: database,
      FINANCE_RESTIC_REPOSITORY: repository,
      FINANCE_RCLONE_DESTINATION: destination,
      RESTIC_PASSWORD_FILE: passwordFile,
      PGHOST: 'localhost',
      PGPORT: '5432',
      PGUSER: 'fixture',
      PGPASSFILE: join(root, 'pgpass'),
    };
    for (const key of [
      'PGPASSWORD',
      'DATABASE_URL',
      'RESTIC_PASSWORD',
      'RESTIC_PASSWORD_COMMAND',
      'RCLONE_CONFIG',
    ])
      delete env[key];
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('validates daily and weekly templates without activating them', () => {
    const template = resolve('infra/finance-backup');
    const files = [
      'finance-hub-backup@.service',
      'finance-hub-backup@.timer',
      'finance-hub-check@.service',
      'finance-hub-check@.timer',
      'finance-hub-backup-failure@.service',
    ];
    for (const file of files)
      expect(readFileSync(join(template, file), 'utf8')).not.toMatch(/password=|token=/i);
    expect(readFileSync(join(template, files[1]), 'utf8')).toContain(
      'OnCalendar=*-*-* 03:00:00 America/Sao_Paulo',
    );
    expect(readFileSync(join(template, files[3]), 'utf8')).toContain(
      'OnCalendar=Sun *-*-* 04:00:00 America/Sao_Paulo',
    );
    const verify = spawnSync(
      'systemd-analyze',
      ['verify', ...files.map((file) => join(template, file))],
      { encoding: 'utf8' },
    );
    if (!verify.error) expect(verify.status, verify.stderr).toBe(0);
  });

  it('rejects unexpected destinations and absent fixture authority', () => {
    expect(run('daily', { FINANCE_BACKUP_FIXTURE_ONLY: '' }).status).not.toBe(0);
    expect(run('daily', { FINANCE_RCLONE_DESTINATION: tmpdir() }).status).not.toBe(0);
    expect(readdirSync(target)).toEqual([]);
  });

  it('rejects a second run while the fixture lock is held', () => {
    const held = spawnSync(
      'flock',
      ['-x', join(root, '.finance-backup.lock'), 'bash', script, 'daily'],
      { env, encoding: 'utf8' },
    );
    expect(held.status).not.toBe(0);
    expect(held.stderr).toContain('LOCKED');
  });

  it('rejects linked control files without changing external sentinels', () => {
    const outside = mkdtempSync(join(tmpdir(), 'finance-p03-sentinel-'));
    writeFileSync(
      join(root, '.finance-offsite-success'),
      `${new Date().toISOString().slice(0, 19)}Z\n`,
    );
    try {
      for (const name of [
        '.finance-backup.lock',
        '.finance-last-failure',
        '.finance-offsite-success.tmp',
        '.finance-offsite-success',
      ]) {
        const control = join(root, name);
        const sentinel = join(outside, name);
        const previous = existsSync(control) ? readFileSync(control) : undefined;
        rmSync(control, { force: true });
        writeFileSync(sentinel, 'external sentinel');
        for (const link of [symlinkSync, linkSync]) {
          link(sentinel, control);
          const rejected = run();
          expect(rejected.status).not.toBe(0);
          expect(rejected.stdout).not.toContain('SUCCESS finished_at');
          expect(readFileSync(sentinel, 'utf8')).toBe('external sentinel');
          const status = spawnSync('bash', [statusScript], { env, encoding: 'utf8' });
          expect(status.stdout).not.toContain('OFFSITE_VERIFIED');
          rmSync(control);
        }
        if (previous) writeFileSync(control, previous);
      }
      const dangling = join(root, '.finance-last-failure');
      symlinkSync(join(outside, 'missing'), dangling);
      expect(spawnSync('bash', [statusScript], { env, encoding: 'utf8' }).stdout).toContain(
        'ALERT_LAST_RUN_FAILED',
      );
      rmSync(dangling);
    } finally {
      rmSync(outside, { recursive: true, force: true });
      rmSync(join(root, '.finance-offsite-success'), { force: true });
    }
  });

  it('preserves prior protection state when rclone fails after local snapshot', () => {
    const previous = run();
    expect(previous.status, previous.stderr).toBe(0);
    const ids = snapshots().map((snapshot) => snapshot.id);
    const artifacts = readdirSync(target);
    const stamp = readFileSync(join(root, '.finance-offsite-success'), 'utf8');
    const rclone = join(bin, 'rclone');
    const original = readFileSync(rclone, 'utf8');
    writeFileSync(rclone, '#!/bin/sh\nexit 17\n', { mode: 0o700 });
    try {
      const failed = run();
      expect(failed.status).not.toBe(0);
      expect(failed.stdout + failed.stderr).toContain('REMOTE_INCOMPLETE');
      expect(failed.stdout).toContain('LOCAL_BACKUP_COMPLETE');
      expect(failed.stdout).not.toContain('SUCCESS finished_at');
      expect(snapshots().length).toBe(ids.length + 1);
      expect(snapshots().map((snapshot) => snapshot.id)).toEqual(expect.arrayContaining(ids));
      expect(readdirSync(target)).toEqual(expect.arrayContaining(artifacts));
      expect(readFileSync(join(root, '.finance-offsite-success'), 'utf8')).toBe(stamp);
      expect(spawnSync('bash', [statusScript], { env, encoding: 'utf8' }).stdout).toContain(
        'ALERT_LAST_RUN_FAILED',
      );
    } finally {
      writeFileSync(rclone, original, { mode: 0o700 });
    }
  }, 120_000);

  it('reports failure and stale verified success without false success', () => {
    const failed = run('daily', { PATH: process.env.PATH });
    expect(failed.status).not.toBe(0);
    expect(failed.stdout + failed.stderr).not.toContain('SUCCESS finished_at');
    expect(spawnSync('bash', [statusScript], { env, encoding: 'utf8' }).stdout).toContain(
      'ALERT_LAST_RUN_FAILED',
    );
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OFFSITE_RETENTION_VERIFIED');
    expect(result.stdout).toContain('SUCCESS finished_at');
    expect(result.stdout + result.stderr).not.toContain(readFileSync(passwordFile, 'utf8'));
    expect(snapshots()).toHaveLength(3);
    writeFileSync(join(root, '.finance-offsite-success'), '2020-01-01T00:00:00Z\n');
    const stale = spawnSync('bash', [statusScript], { env, encoding: 'utf8' });
    expect(stale.status).toBe(2);
    expect(stale.stdout).toContain('ALERT_BACKUP_OLDER_THAN_24H');
  }, 120_000);

  it('runs a weekly repository check and preserves prior backup after check failure', () => {
    expect(run('weekly-check').status).toBe(0);
    const before = snapshots().map((snapshot) => snapshot.id);
    const bad = run('weekly-check', { RESTIC_PASSWORD_FILE: join(root, 'pgpass') });
    expect(bad.status).not.toBe(0);
    expect(snapshots().map((snapshot) => snapshot.id)).toEqual(before);
  }, 120_000);

  it('releases the lock after interruption and preserves prior snapshots', () => {
    const dump = join(bin, 'pg_dump');
    const original = readFileSync(dump, 'utf8');
    const prior = snapshots().map((snapshot) => snapshot.id);
    writeFileSync(dump, '#!/bin/sh\nsleep 10\n', { mode: 0o700 });
    const interrupted = spawnSync('timeout', ['-s', 'TERM', '1', 'bash', script, 'daily'], {
      env,
      encoding: 'utf8',
      timeout: 20_000,
    });
    writeFileSync(dump, original, { mode: 0o700 });
    expect(interrupted.status).not.toBe(0);
    expect(snapshots().map((snapshot) => snapshot.id)).toEqual(prior);
    expect(run().status).toBe(0);
  }, 120_000);

  it('applies real Restic 14 daily, 8 weekly and 12 monthly retention to dated snapshots', () => {
    const artifact = join(target, readdirSync(target)[0]);
    const dates: string[] = [];
    for (let days = 1; days <= 35; days++) {
      dates.push(
        new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' '),
      );
    }
    for (let months = 2; months <= 14; months++) {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() - months, 15);
      dates.push(date.toISOString().slice(0, 19).replace('T', ' '));
    }
    const commands = dates
      .map((date) => `restic backup --quiet --tag finance-hub --time '${date}' -- '${artifact}'`)
      .join('\n');
    const seeded = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '-v',
        `${root}:${root}`,
        '-e',
        `RESTIC_REPOSITORY=${repository}`,
        '-e',
        `RESTIC_PASSWORD_FILE=${passwordFile}`,
        '--entrypoint',
        '/bin/sh',
        'restic/restic:0.18.1',
        '-ec',
        commands,
      ],
      { encoding: 'utf8', timeout: 300_000 },
    );
    expect(seeded.status, seeded.stderr).toBe(0);
    const before = snapshots();
    expect(before.length).toBeGreaterThan(45);
    const latestBefore = before.find((snapshot) =>
      snapshot.time.startsWith(dates[0].replace(' ', 'T')),
    );
    expect(latestBefore).toBeDefined();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const after = snapshots();
    expect(after.length).toBeLessThan(before.length);
    expect(after.some((snapshot) => snapshot.id === latestBefore?.id)).toBe(true);
    expect(after.some((snapshot) => snapshot.time.slice(0, 7) === dates.at(-4)?.slice(0, 7))).toBe(
      true,
    );
    expect(
      readdirSync(destination)
        .filter((entry) => entry !== 'locks')
        .sort(),
    ).toEqual(
      readdirSync(repository)
        .filter((entry) => entry !== 'locks')
        .sort(),
    );
  }, 600_000);

  it('keeps three valid local artifacts and rejects ambiguous cleanup', () => {
    for (let i = 0; i < 3; i++) expect(run().status).toBe(0);
    expect(readdirSync(target)).toHaveLength(3);
    const extra = join(target, 'unrelated');
    writeFileSync(extra, 'retain');
    const rejected = run();
    expect(rejected.status).not.toBe(0);
    expect(readFileSync(extra, 'utf8')).toBe('retain');
    rmSync(extra);
  }, 600_000);
});
