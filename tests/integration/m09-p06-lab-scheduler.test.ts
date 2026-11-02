import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

describe('M09-P06 disposable Finance Lab adaptation', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-p06-'));
  const bin = join(root, 'bin');
  const target = join(root, 'databases', 'finance-hub', 'lab');
  const repository = join(root, 'restic', 'finance-hub-lab-p06');
  const remote = join(root, 'remote');
  const password = join(tmpdir(), `finance-p06-password-${randomUUID()}`);
  const pgpass = join(tmpdir(), `finance-p06-pgpass-${randomUUID()}`);
  const config = join(tmpdir(), `finance-p06-rclone-${randomUUID()}`);
  const script = resolve('scripts/backup/finance-hub-lab-scheduled.sh');
  let env: NodeJS.ProcessEnv;
  const run = (mode = 'daily', changes: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [script, mode], {
      env: { ...env, ...changes },
      encoding: 'utf8',
      timeout: 120_000,
    });

  beforeAll(() => {
    mkdirSync(bin);
    mkdirSync(target, { recursive: true, mode: 0o700 });
    mkdirSync(repository, { recursive: true, mode: 0o700 });
    mkdirSync(remote, { mode: 0o700 });
    writeFileSync(join(root, '.finance-backup-test-fixture'), 'owned');
    writeFileSync(join(repository, '.finance-lab-p06-owned'), randomUUID().replaceAll('-', ''), {
      mode: 0o600,
    });
    writeFileSync(password, randomUUID(), { mode: 0o600 });
    writeFileSync(pgpass, 'fixture', { mode: 0o600 });
    writeFileSync(config, `[finance-drive]\ntype = alias\nremote = ${remote}\n`, { mode: 0o600 });
    writeFileSync(join(bin, 'pg_dump'), '#!/bin/sh\nprintf PGDMPsynthetic-fixture\n', {
      mode: 0o700,
    });
    writeFileSync(join(bin, 'pg_restore'), '#!/bin/sh\nprintf "fixture archive listing\\n"\n', {
      mode: 0o700,
    });
    writeFileSync(join(bin, 'psql'), '#!/bin/sh\nprintf t\n', { mode: 0o700 });
    writeFileSync(
      join(bin, 'restic'),
      `#!/bin/sh\nexec docker run --rm --user "$(id -u):$(id -g)" -v '${root}:${root}' -v '${password}:${password}:ro' -v '${pgpass}:${pgpass}:ro' -e RESTIC_REPOSITORY -e RESTIC_PASSWORD_FILE restic/restic:0.18.1 "$@"\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(bin, 'rclone'),
      `#!/bin/sh\nexec docker run --rm --user "$(id -u):$(id -g)" -v '${root}:${root}' -v '${config}:${config}:ro' -e RCLONE_CONFIG rclone/rclone:1.72.0 "$@"\n`,
      { mode: 0o700 },
    );
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FINANCE_LAB_SCHEDULE_ENABLED: 'yes',
      FINANCE_LAB_DISPOSABLE_TEST: 'yes',
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: 'finance_hub_lab',
      FINANCE_RESTIC_REPOSITORY: repository,
      FINANCE_RCLONE_REMOTE: 'finance-drive:FinanceHub-Backups/finance-lab-p06/test',
      RESTIC_PASSWORD_FILE: password,
      RCLONE_CONFIG_FILE: config,
      PGHOST: 'postgres-products',
      PGPORT: '5432',
      PGUSER: 'read_only',
      PGPASSFILE: pgpass,
    };
    for (const key of [
      'RESTIC_PASSWORD',
      'RESTIC_PASSWORD_COMMAND',
      'PGPASSWORD',
      'DATABASE_URL',
      'RCLONE_CONFIG',
    ])
      delete env[key];
    const init = spawnSync('bash', ['-c', 'restic init --quiet'], {
      env: { ...env, RESTIC_REPOSITORY: repository },
      encoding: 'utf8',
    });
    expect(init.status, init.stderr).toBe(0);
  }, 120_000);
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    for (const file of [password, pgpass, config]) rmSync(file, { force: true });
  });

  it('keeps P03 fixture runner separate and rejects unauthorized targets', () => {
    const units = [
      'finance-hub-lab-backup.service',
      'finance-hub-lab-backup.timer',
      'finance-hub-lab-check.service',
      'finance-hub-lab-check.timer',
      'finance-hub-lab-status.service',
      'finance-hub-lab-status.timer',
      'finance-hub-lab-alert@.service',
    ];
    const unitPath = resolve('infra/finance-backup');
    for (const unit of units)
      expect(readFileSync(join(unitPath, unit), 'utf8')).not.toMatch(/password=|token=/i);
    expect(readFileSync(join(unitPath, units[1]), 'utf8')).toContain('America/Sao_Paulo');
    expect(readFileSync(join(unitPath, units[3]), 'utf8')).toContain('America/Sao_Paulo');
    const verify = spawnSync(
      'systemd-analyze',
      ['verify', ...units.map((unit) => join(unitPath, unit))],
      { encoding: 'utf8' },
    );
    if (!verify.error) expect(verify.status, verify.stderr).toBe(0);
    expect(readFileSync(resolve('scripts/backup/finance-hub-scheduled.sh'), 'utf8')).toContain(
      'FINANCE_BACKUP_FIXTURE_ONLY',
    );
    for (const changes of [
      { FINANCE_LAB_SCHEDULE_ENABLED: '' },
      { FINANCE_BACKUP_ALLOWED_DATABASE: 'finance_hub_prod' },
      { PGHOST: 'n8n-postgres' },
      { FINANCE_RCLONE_REMOTE: 'finance-drive:other' },
      { RESTIC_PASSWORD: 'inline' },
    ])
      expect(run('daily', changes).status).not.toBe(0);
    expect(readdirSync(target)).toEqual([]);
  });

  it('serializes runs and verifies off-site only after successful copy and check', () => {
    const held = spawnSync(
      'flock',
      ['-x', join(root, '.finance-lab-p06.lock'), 'bash', script, 'daily'],
      { env, encoding: 'utf8' },
    );
    expect(held.status).not.toBe(0);
    expect(held.stderr).toContain('LOCKED');
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('OFFSITE_RETENTION_VERIFIED');
    expect(first.stdout).toMatch(/LOCAL_BACKUP_COMPLETE dump_bytes=[0-9]+/);
    expect(first.stdout).toMatch(/OFFSITE_RETENTION_VERIFIED snapshot=[a-f0-9]{64}/);
    expect(run('status').status).toBe(0);
    const statusDuringLock = spawnSync(
      'flock',
      ['-x', join(root, '.finance-lab-p06.lock'), 'bash', script, 'status'],
      { env, encoding: 'utf8' },
    );
    expect(statusDuringLock.status, statusDuringLock.stderr).toBe(0);
    const stamp = readFileSync(join(root, '.finance-lab-p06-success'), 'utf8');
    const active = readFileSync(join(root, '.finance-lab-p06-active-slot'), 'utf8').trim();
    const activeRepository = join(remote, 'FinanceHub-Backups', 'finance-lab-p06', 'test', active);
    const rclone = join(bin, 'rclone');
    const original = readFileSync(rclone, 'utf8');
    writeFileSync(rclone, '#!/bin/sh\nexit 17\n', { mode: 0o700 });
    try {
      const failed = run();
      expect(failed.status).not.toBe(0);
      expect(failed.stdout + failed.stderr).toContain('REMOTE_INCOMPLETE');
      expect(failed.stdout).toContain('LOCAL_BACKUP_COMPLETE');
      expect(failed.stdout).not.toContain('SUCCESS finished_at');
      expect(readFileSync(join(root, '.finance-lab-p06-success'), 'utf8')).toBe(stamp);
      expect(readFileSync(join(root, '.finance-lab-p06-active-slot'), 'utf8').trim()).toBe(active);
      const recovered = spawnSync('restic', ['check', '--quiet'], {
        env: { ...env, RESTIC_REPOSITORY: activeRepository },
        encoding: 'utf8',
        timeout: 120_000,
      });
      expect(recovered.status, recovered.stderr).toBe(0);
      expect(run('status').status).not.toBe(0);
    } finally {
      writeFileSync(rclone, original, { mode: 0o700 });
    }
    expect(run().status).toBe(0);
    expect(run('status').status).toBe(0);
    expect(readdirSync(target)).toHaveLength(3);
    writeFileSync(join(root, '.finance-lab-p06-success'), '2020-01-01T00:00:00Z\n');
    expect(run('status').stderr).toContain('ALERT_BACKUP_OLDER_THAN_24H');
  }, 120_000);

  it('preserves snapshots on credential and integrity failures', () => {
    expect(run('weekly-check').status).toBe(0);
    expect(run('weekly-check', { RESTIC_PASSWORD_FILE: pgpass }).status).not.toBe(0);
    const marker = join(target, 'unowned');
    writeFileSync(marker, 'unowned');
    const refused = run();
    expect(refused.status).not.toBe(0);
    expect(refused.stdout + refused.stderr).toContain('UNOWNED_LOCAL_ENTRY');
    rmSync(marker);
  }, 120_000);

  it('rejects invalid dumps and unrelated remote entries without reporting success', () => {
    const dump = join(bin, 'pg_dump');
    const original = readFileSync(dump, 'utf8');
    const stamp = readFileSync(join(root, '.finance-lab-p06-success'), 'utf8');
    const priorArtifacts = new Set(readdirSync(target));
    writeFileSync(dump, '#!/bin/sh\nprintf invalid\n', { mode: 0o700 });
    try {
      const invalid = run();
      expect(invalid.status).not.toBe(0);
      expect(invalid.stdout + invalid.stderr).toContain('INVALID_DUMP_OR_MANIFEST');
      expect(invalid.stdout).not.toContain('SUCCESS finished_at');
      expect(readFileSync(join(root, '.finance-lab-p06-success'), 'utf8')).toBe(stamp);
    } finally {
      writeFileSync(dump, original, { mode: 0o700 });
      for (const entry of readdirSync(target))
        if (!priorArtifacts.has(entry))
          rmSync(join(target, entry), { recursive: true, force: true });
    }
    const active = readFileSync(join(root, '.finance-lab-p06-active-slot'), 'utf8').trim();
    const next = active === 'slot-a' ? 'slot-b' : 'slot-a';
    const foreign = join(remote, 'FinanceHub-Backups', 'finance-lab-p06', 'test', next, 'foreign');
    writeFileSync(foreign, 'preserve');
    try {
      const refused = run();
      expect(refused.status).not.toBe(0);
      expect(refused.stdout + refused.stderr).toContain('UNOWNED_REMOTE_ENTRY');
      expect(readFileSync(foreign, 'utf8')).toBe('preserve');
      expect(readFileSync(join(root, '.finance-lab-p06-success'), 'utf8')).toBe(stamp);
    } finally {
      rmSync(foreign);
    }
  }, 120_000);

  it('expires dated snapshots across distinct artifact paths under the 14/8/12 policy', () => {
    const dates = Array.from({ length: 20 }, (_, i) => {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() - i - 1, 15);
      return date.toISOString().slice(0, 19).replace('T', ' ');
    });
    const commands = dates
      .map((date, i) => {
        const path = join(target, `seed-${i}`);
        return `mkdir '${path}'; printf seed > '${path}/data'; restic backup --quiet --tag finance-hub-lab-p06 --time '${date}' -- '${path}'; rm '${path}/data'; rmdir '${path}'`;
      })
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
        '-v',
        `${password}:${password}:ro`,
        '-e',
        `RESTIC_REPOSITORY=${repository}`,
        '-e',
        `RESTIC_PASSWORD_FILE=${password}`,
        '--entrypoint',
        '/bin/sh',
        'restic/restic:0.18.1',
        '-ec',
        commands,
      ],
      { encoding: 'utf8', timeout: 300_000 },
    );
    expect(seeded.status, seeded.stderr).toBe(0);
    const list = () => {
      const result = spawnSync('restic', ['snapshots', '--json'], {
        env: { ...env, RESTIC_REPOSITORY: repository },
        encoding: 'utf8',
        timeout: 120_000,
      });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout) as Array<{ id: string; time: string }>;
    };
    const before = list();
    expect(before.length).toBeGreaterThanOrEqual(20);
    const latest = before.find((snapshot) => snapshot.time.startsWith(dates[0].replace(' ', 'T')));
    expect(latest).toBeDefined();
    const retained = run();
    expect(retained.status, retained.stderr).toBe(0);
    const after = list();
    expect(after.length).toBeLessThan(before.length);
    expect(after.some((snapshot) => snapshot.id === latest?.id)).toBe(true);
    expect(readdirSync(target)).toHaveLength(3);
  }, 600_000);
});
