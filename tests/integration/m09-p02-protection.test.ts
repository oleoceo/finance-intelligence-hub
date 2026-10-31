import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

describe('M09-P02 encrypted local and off-site protection', () => {
  const root = mkdtempSync(join(tmpdir(), 'finance-protection-'));
  const bin = join(root, 'bin');
  const output = join(root, 'databases', 'finance-hub', 'local');
  const repository = join(root, 'repository');
  const remote = join(root, 'remote');
  const passwordFile = join(root, 'restic-password');
  const database = `finance_test_${randomUUID().replaceAll('-', '')}`;
  const dumpScript = resolve('scripts/backup/finance-hub-dump.sh');
  const protectScript = resolve('scripts/backup/finance-hub-protect.sh');
  const password = randomUUID();
  let container: Awaited<ReturnType<GenericContainer['start']>>;
  let artifact: string;
  let env: NodeJS.ProcessEnv;
  const snapshots = () => {
    const list = docker(
      'restic/restic:0.18.1',
      ['snapshots', '--json'],
      ['-e', `RESTIC_REPOSITORY=${repository}`, '-e', `RESTIC_PASSWORD_FILE=${passwordFile}`],
    );
    expect(list.status, list.stderr).toBe(0);
    return JSON.parse(list.stdout).length as number;
  };
  const remoteFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? remoteFiles(path) : [path];
    });

  const run = (path = artifact, changes: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [protectScript, path], { env: { ...env, ...changes }, encoding: 'utf8' });
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
      { encoding: 'utf8' },
    );

  beforeAll(async () => {
    mkdirSync(bin);
    mkdirSync(output, { recursive: true, mode: 0o700 });
    mkdirSync(repository, { mode: 0o700 });
    mkdirSync(remote, { mode: 0o700 });
    writeFileSync(passwordFile, password, { mode: 0o600 });
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
      FINANCE_BACKUP_ROOT: root,
      FINANCE_BACKUP_ALLOWED_DATABASE: database,
      PGHOST: container.getHost(),
      PGPORT: String(container.getMappedPort(5432)),
      PGUSER: 'test_admin',
      PGPASSFILE: join(root, 'pgpass'),
      FINANCE_RESTIC_REPOSITORY: repository,
      FINANCE_RCLONE_DESTINATION: remote,
      RESTIC_PASSWORD_FILE: passwordFile,
    };
    delete env.PGPASSWORD;
    delete env.DATABASE_URL;
    delete env.RESTIC_PASSWORD;
    delete env.RESTIC_PASSWORD_COMMAND;
    const dump = spawnSync('bash', [dumpScript, 'local', database], { env, encoding: 'utf8' });
    expect(dump.status, dump.stderr).toBe(0);
    artifact = join(output, readdirSync(output)[0]);
  }, 120_000);
  afterAll(async () => {
    await container?.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('creates an encrypted snapshot, checks it, and independently restores from the remote copy', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OFFSITE_COMPLETE');
    expect(result.stdout + result.stderr).not.toContain(password);
    const list = docker(
      'restic/restic:0.18.1',
      ['snapshots', '--json'],
      ['-e', `RESTIC_REPOSITORY=${repository}`, '-e', `RESTIC_PASSWORD_FILE=${passwordFile}`],
    );
    expect(list.status, list.stderr).toBe(0);
    expect(JSON.parse(list.stdout).length).toBeGreaterThan(0);
    const remoteRepo = join(root, 'remote-copy');
    mkdirSync(remoteRepo);
    cpSync(remote, remoteRepo, { recursive: true });
    const copied = remoteRepo;
    const restore = join(root, 'restore');
    mkdirSync(restore);
    const restoreEnv = [
      '-e',
      `RESTIC_REPOSITORY=${copied}`,
      '-e',
      `RESTIC_PASSWORD_FILE=${passwordFile}`,
    ];
    expect(docker('restic/restic:0.18.1', ['check', '--quiet'], restoreEnv).status).toBe(0);
    const restored = docker(
      'restic/restic:0.18.1',
      ['restore', 'latest', '--target', restore, '--quiet'],
      restoreEnv,
    );
    expect(restored.status, restored.stderr).toBe(0);
    const found = join(restore, artifact.slice(1), 'archive.dump');
    expect(existsSync(found)).toBe(true);
    const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(hash(found)).toBe(hash(join(artifact, 'archive.dump')));
    expect(readFileSync(join(restore, artifact.slice(1), 'manifest.json'), 'utf8')).toBe(
      readFileSync(join(artifact, 'manifest.json'), 'utf8'),
    );
    expect(readdirSync(remote).sort()).toEqual(['config', 'data', 'index', 'keys', 'snapshots']);
    expect(readdirSync(remote, { recursive: true }).join(' ')).not.toContain('archive.dump');
    expect(readdirSync(remote, { recursive: true }).join(' ')).not.toContain('manifest.json');
    const marker = database;
    for (const file of remoteFiles(remote)) {
      const bytes = readFileSync(file);
      expect(bytes.includes(Buffer.from('PGDMP')), file).toBe(false);
      expect(bytes.includes(Buffer.from(marker)), file).toBe(false);
    }
  }, 120_000);

  it('rejects corrupt, truncated, and incomplete P01 artifacts without a new snapshot', () => {
    const before = snapshots();
    const bad = join(root, 'bad-artifact');
    cpSync(artifact, bad, { recursive: true });
    writeFileSync(join(bad, 'archive.dump'), 'PGDMPcorrupt');
    expect(run(bad).status).not.toBe(0);
    cpSync(artifact, bad, { recursive: true, force: true });
    writeFileSync(join(bad, 'archive.dump'), 'PGDMP');
    expect(run(bad).status).not.toBe(0);
    rmSync(join(bad, 'manifest.json'));
    expect(run(bad).status).not.toBe(0);
    expect(run(join(output, '.staging.fake')).status).not.toBe(0);
    expect(snapshots()).toBe(before);
  });

  it('rejects unexpected plaintext at the destination without deleting it', () => {
    const extra = join(remote, 'archive.dump');
    const plaintext = 'PGDMP-unexpected-plaintext';
    writeFileSync(extra, plaintext);
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('REMOTE_INCOMPLETE');
    expect(result.stdout + result.stderr).not.toContain('OFFSITE_COMPLETE');
    expect(readFileSync(extra, 'utf8')).toBe(plaintext);
    rmSync(extra);
  }, 120_000);

  it('does not transfer an unexpected plaintext file in the repository', () => {
    const extra = join(repository, 'archive.dump');
    writeFileSync(extra, 'PGDMP-local-plaintext');
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain('OFFSITE_COMPLETE');
    expect(readFileSync(extra, 'utf8')).toBe('PGDMP-local-plaintext');
    expect(existsSync(join(remote, 'archive.dump'))).toBe(false);
    rmSync(extra);
  }, 120_000);

  it('rejects password paths in copied trees before snapshot or transfer', () => {
    const before = snapshots();
    for (const tree of [repository, remote, artifact]) {
      const nested = join(tree, 'nested');
      mkdirSync(nested);
      const exposed = join(nested, 'password');
      writeFileSync(exposed, password, { mode: 0o600 });
      const result = run(artifact, { RESTIC_PASSWORD_FILE: exposed });
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain('OFFSITE_COMPLETE');
      expect(result.stdout + result.stderr).not.toContain(password);
      expect(readFileSync(exposed, 'utf8')).toBe(password);
      expect(snapshots()).toBe(before);
      rmSync(nested, { recursive: true });
    }
    const alias = join(root, 'repository-alias');
    symlinkSync(realpathSync(repository), alias, 'dir');
    const exposed = join(repository, 'password');
    writeFileSync(exposed, password, { mode: 0o600 });
    const result = run(artifact, { RESTIC_PASSWORD_FILE: join(alias, 'password') });
    expect(result.status).not.toBe(0);
    expect(snapshots()).toBe(before);
    rmSync(exposed);
    rmSync(alias);
  }, 120_000);

  it('rejects missing and wrong passwords without remote success', () => {
    expect(run(artifact, { RESTIC_PASSWORD_FILE: '' }).status).not.toBe(0);
    const wrong = join(root, 'wrong-password');
    writeFileSync(wrong, randomUUID(), { mode: 0o600 });
    const result = run(artifact, { RESTIC_PASSWORD_FILE: wrong });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain(password);
    expect(result.stdout + result.stderr).not.toContain('OFFSITE_COMPLETE');
  }, 60_000);

  it('keeps local snapshot after remote transport failure and retries safely', () => {
    const isolated = join(root, 'isolated-remote');
    mkdirSync(isolated);
    const original = readFileSync(join(bin, 'rclone'), 'utf8');
    writeFileSync(join(bin, 'rclone'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const failed = run(artifact, { FINANCE_RCLONE_DESTINATION: isolated });
    expect(failed.status).toBe(2);
    expect(failed.stderr).toContain('REMOTE_INCOMPLETE');
    expect(failed.stdout + failed.stderr).not.toContain('OFFSITE_COMPLETE');
    expect(existsSync(join(repository, 'config'))).toBe(true);
    expect(existsSync(join(artifact, 'archive.dump'))).toBe(true);
    writeFileSync(join(bin, 'rclone'), original, { mode: 0o700 });
    const retried = run(artifact, { FINANCE_RCLONE_DESTINATION: isolated });
    expect(retried.status, retried.stderr).toBe(0);
    expect(existsSync(join(isolated, 'config'))).toBe(true);
    expect(existsSync(join(remote, 'config'))).toBe(true);
  }, 120_000);
});
