import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
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

  it('routes the operational Lab dump through the internal Docker client with the existing directory owner', () => {
    const units = ['backup', 'check', 'status'];
    for (const unit of units) {
      const service = readFileSync(
        resolve(`infra/finance-backup/finance-hub-lab-${unit}.service`),
        'utf8',
      );
      expect(service).toContain('User=leoceo\nGroup=leoceo');
      expect(service).not.toContain('User=finance-backup');
    }
    const scheduler = readFileSync(script, 'utf8');
    expect(scheduler).toContain('command -v docker');
    expect(scheduler).toContain('docker image inspect finance-hub-p05-client');
    expect(scheduler).toContain('finance-hub-lab-validate-dump.sh');
    expect(scheduler).toContain('if [[ $root == /opt/apps/backups ]]; then');
    expect(scheduler).toContain('finance-hub-lab-docker-dump.sh');
    const adapter = readFileSync(resolve('scripts/backup/finance-hub-lab-docker-dump.sh'), 'utf8');
    expect(adapter).toContain('leoceo:leoceo:700');
    expect(adapter).toContain('docker network inspect');
    expect(adapter).toContain('--network finance-products-db --user');
    expect(adapter).toContain(
      '--mount type=bind,src=/opt/apps/backups,dst=/opt/apps/backups,readonly',
    );
    expect(adapter).toContain(
      '--mount type=bind,src=/opt/apps/backups/databases/finance-hub/lab,dst=/opt/apps/backups/databases/finance-hub/lab',
    );
    expect(adapter).toContain('docker image inspect finance-hub-p05-client');
    expect(adapter).not.toMatch(/--publish|--privileged|sudo/);
    const rejected = spawnSync('bash', [resolve('scripts/backup/finance-hub-lab-docker-dump.sh')], {
      env,
      encoding: 'utf8',
    });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('FAILED');
  });

  it('validates a dump with the pinned offline Docker client and propagates failures', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'finance-p06-catalog-'));
    try {
      const artifact = join(fixture, 'artifact');
      const mockBin = join(fixture, 'bin');
      mkdirSync(artifact);
      mkdirSync(mockBin);
      writeFileSync(join(artifact, 'archive.dump'), 'PGDMPfixture');
      const argsFile = join(fixture, 'args');
      const imageId = `sha256:${'b'.repeat(64)}`;
      writeFileSync(
        join(mockBin, 'docker'),
        `#!/bin/sh\nif [ "$1" = image ]; then echo '${imageId}'; exit 0; fi\nprintf '%s\\n' "$@" > '${argsFile}'\nexit "\${MOCK_DOCKER_EXIT:-0}"\n`,
        { mode: 0o700 },
      );
      const helper = resolve('scripts/backup/finance-hub-lab-validate-dump.sh');
      const localEnv = {
        ...env,
        PATH: `${mockBin}:/usr/bin:/bin`,
        FINANCE_P06_CLIENT_IMAGE_ID: imageId,
      };
      const valid = spawnSync('bash', [helper, artifact], { env: localEnv, encoding: 'utf8' });
      expect(valid.status, valid.stderr).toBe(0);
      const args = readFileSync(argsFile, 'utf8');
      expect(args).toContain('--network\nnone\n');
      expect(args).toContain('--cap-drop\nALL\n');
      expect(args).toContain('--read-only\n');
      expect(args).toContain(`src=${artifact},dst=/artifact,readonly`);
      expect(args).toContain(imageId);
      expect(args).toContain('pg_restore\n--list\n/artifact/archive.dump');
      expect(
        spawnSync('bash', [helper, artifact], { env: { ...localEnv, MOCK_DOCKER_EXIT: '17' } })
          .status,
      ).toBe(17);
      expect(
        spawnSync('bash', [helper, artifact], {
          env: { ...localEnv, FINANCE_P06_CLIENT_IMAGE_ID: `sha256:${'c'.repeat(64)}` },
        }).status,
      ).not.toBe(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('executes the guarded Docker boundary with matching UID, internal network and scoped mounts', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'finance-p06-boundary-'));
    try {
      const checkout = join(fixture, 'checkout');
      const backups = join(fixture, 'backups');
      const lab = join(backups, 'databases', 'finance-hub', 'lab');
      const scripts = join(checkout, 'scripts', 'backup');
      mkdirSync(scripts, { recursive: true });
      mkdirSync(lab, { recursive: true, mode: 0o700 });
      const credential = join(fixture, 'pgpass');
      writeFileSync(credential, 'fixture', { mode: 0o600 });
      writeFileSync(join(scripts, 'finance-hub-lab-dump.sh'), '#!/bin/sh\nexit 0\n');
      const username = spawnSync('id', ['-un'], { encoding: 'utf8' }).stdout.trim();
      const group = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
      const adapter = readFileSync(resolve('scripts/backup/finance-hub-lab-docker-dump.sh'), 'utf8')
        .replaceAll('/opt/apps/backups', backups)
        .replaceAll('/opt/apps/apps/lab/finance-hub-p06', checkout)
        .replaceAll('leoceo:leoceo:700', `${username}:${group}:700`)
        .replace('$(id -un) == leoceo', `$(id -un) == ${username}`);
      writeFileSync(join(scripts, 'finance-hub-lab-docker-dump.sh'), adapter);
      const mockBin = join(fixture, 'bin');
      mkdirSync(mockBin);
      const argsFile = join(fixture, 'docker-args');
      const imageId = `sha256:${'a'.repeat(64)}`;
      writeFileSync(
        join(mockBin, 'docker'),
        `#!/bin/sh\ncase "$1 $2" in\n  'network inspect') echo true;;\n  'inspect --format') echo yes;;\n  'image inspect') echo '${imageId}';;\n  'run --rm') printf '%s\\n' "$@" > '${argsFile}';;\n  *) exit 1;;\nesac\n`,
        { mode: 0o700 },
      );
      const result = spawnSync('bash', [join(scripts, 'finance-hub-lab-docker-dump.sh')], {
        env: {
          ...env,
          PATH: `${mockBin}:${env.PATH}`,
          FINANCE_BACKUP_ROOT: backups,
          PGPASSFILE: credential,
          FINANCE_P06_CLIENT_IMAGE_ID: imageId,
        },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      const args = readFileSync(argsFile, 'utf8');
      expect(args).toContain('finance-products-db\n--user\n');
      expect(args).toContain(`${process.getuid?.()}:${process.getgid?.()}`);
      expect(args).toContain(`src=${backups},dst=${backups},readonly`);
      expect(args).toContain(`src=${lab},dst=${lab}`);
      expect(args).toContain(`src=${credential},dst=${credential},readonly`);
      expect(args).toContain(imageId);
      expect(args).not.toContain('--publish');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
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
    const firstName = readdirSync(target)[0];
    const historical = 'finance-hub_lab_finance_hub_lab_2020-01-01_000000_1_aaaaaaaa';
    cpSync(join(target, readdirSync(target)[0]), join(target, historical), { recursive: true });
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
    expect(readdirSync(target)).toHaveLength(4);
    expect(readdirSync(target)).toContain(historical);
    expect(run().status).toBe(0);
    expect(readdirSync(target)).not.toContain(firstName);
    expect(readdirSync(target)).toContain(historical);
    const owned = readdirSync(target).find((entry) => entry !== historical);
    expect(owned).toBeDefined();
    const ownedMarker = join(root, '.finance-lab-p06-artifacts', owned!);
    const originalMarker = readFileSync(ownedMarker, 'utf8');
    writeFileSync(ownedMarker, 'bad-hash\n', { mode: 0o600 });
    const rejectedRetention = run();
    expect(rejectedRetention.status).not.toBe(0);
    expect(rejectedRetention.stderr).toContain('P06 marker hash mismatch');
    expect(readdirSync(target)).toContain(historical);
    writeFileSync(ownedMarker, originalMarker, { mode: 0o600 });
    rmSync(join(root, '.finance-lab-p06-failure'));
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
    expect(readdirSync(target)).toHaveLength(4);
    expect(readdirSync(target)).toContain(
      'finance-hub_lab_finance_hub_lab_2020-01-01_000000_1_aaaaaaaa',
    );
  }, 600_000);

  it('preserves legacy flat Finance Lab dumps and rejects matching symlinks', () => {
    const legacy = [
      'finance_hub_lab_20261028_224103.dump',
      'finance_hub_lab_postmigrations.dump.gpg',
      'finance_hub_lab_20261028_224103.dump.sha256',
      'finance_hub_lab_postmigrations.dump',
      'finance_hub_lab_20261028_224103.dump.gpg.sha256',
      'finance_hub_lab_v2.dump.gpg.sha256',
      'finance_hub_lab_20261028_224103.dump.gpg',
      'finance_hub_lab_v2.dump.gpg',
      'finance_hub_lab_postmigrations.dump.gpg.sha256',
    ];
    for (const [index, name] of legacy.entries())
      writeFileSync(join(target, name), `legacy-content-${index}`, {
        mode: index % 3 === 0 ? 0o600 : 0o664,
      });

    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('SUCCESS finished_at');
    for (const [index, name] of legacy.entries()) {
      expect(result.stdout).toContain(`LOCAL_PRESERVED legacy_file=${name}`);
      const contents = readFileSync(join(target, name), 'utf8');
      expect(contents).toBe(`legacy-content-${index}`);
    }
    const owned = readdirSync(target).filter((name) =>
      name.startsWith('finance-hub_lab_'),
    );
    expect(owned).toHaveLength(4); // Historical P05 directory + the three retained P06 directories.

    const link = join(target, 'finance_hub_lab_link.dump');
    symlinkSync(join(target, legacy[0]), link);
    try {
      const rejected = run();
      expect(rejected.status).not.toBe(0);
      expect(rejected.stdout + rejected.stderr).toContain('UNOWNED_LOCAL_ENTRY');
      for (const [index, name] of legacy.entries()) {
        const contents = readFileSync(join(target, name), 'utf8');
        expect(contents).toBe(`legacy-content-${index}`);
      }
    } finally {
      rmSync(link);
    }
  }, 120_000);
});
