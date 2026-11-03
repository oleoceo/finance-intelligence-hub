import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('Issue #100 Production backup gate', () => {
  const script = resolve('scripts/backup/finance-hub-production-scheduled.sh');

  it('rejects wrong database, Lab remote and Lab repository before any backup command', () => {
    const root = mkdtempSync(join(tmpdir(), 'finance-production-gate-'));
    try {
      const target = join(root, 'databases', 'finance-hub', 'production');
      const repo = join(root, 'restic', 'finance-hub-production-v01');
      mkdirSync(target, { recursive: true, mode: 0o700 });
      mkdirSync(repo, { recursive: true, mode: 0o700 });
      writeFileSync(join(root, '.finance-backup-test-fixture'), 'owned');
      writeFileSync(join(repo, '.finance-production-v01-owned'), 'a'.repeat(32), { mode: 0o600 });
      const env = {
        ...process.env,
        FINANCE_PRODUCTION_SCHEDULE_ENABLED: 'yes',
        FINANCE_PRODUCTION_DISPOSABLE_TEST: 'yes',
        FINANCE_BACKUP_ALLOWED_DATABASE: 'finance_hub_prod',
        FINANCE_BACKUP_ROOT: root,
        FINANCE_RESTIC_REPOSITORY: repo,
        FINANCE_RCLONE_REMOTE: 'finance-drive:FinanceHub-Backups/finance-production-v01/test',
        PGHOST: 'postgres-products',
        PGPORT: '5432',
        PGUSER: 'backup_ro',
      };
      const run = (changes: Record<string, string>) =>
        spawnSync('bash', [script, 'daily'], { env: { ...env, ...changes }, encoding: 'utf8' });

      expect(run({ FINANCE_BACKUP_ALLOWED_DATABASE: 'finance_hub_lab' }).status).not.toBe(0);
      expect(
        run({ FINANCE_RCLONE_REMOTE: 'finance-drive:FinanceHub-Backups/finance-lab-p06/test' })
          .status,
      ).not.toBe(0);
      expect(
        run({ FINANCE_RESTIC_REPOSITORY: join(root, 'restic', 'finance-hub-lab-p06') }).status,
      ).not.toBe(0);
      expect(readFileSync(join(repo, '.finance-production-v01-owned'), 'utf8')).toBe(
        'a'.repeat(32),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the same pinned client-image variable in the production execution path', () => {
    for (const path of [
      script,
      resolve('scripts/backup/finance-hub-production-docker-dump.sh'),
      resolve('scripts/backup/finance-hub-production-validate-dump.sh'),
      resolve('docs/runbooks/production-backup-and-v01-update-plan.md'),
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('FINANCE_P06_CLIENT_IMAGE_ID');
      expect(source).not.toContain('FINANCE_Production_CLIENT_IMAGE_ID');
    }
  });

  it('accepts healthy status and weekly check in an owned disposable Production fixture', () => {
    const work = mkdtempSync(join(tmpdir(), 'finance-production-status-'));
    try {
      const root = join(work, 'backup');
      const target = join(root, 'databases', 'finance-hub', 'production');
      const repo = join(root, 'restic', 'finance-hub-production-v01');
      const secrets = join(work, 'secrets');
      const bin = join(work, 'bin');
      mkdirSync(target, { recursive: true, mode: 0o700 });
      mkdirSync(repo, { recursive: true, mode: 0o700 });
      mkdirSync(secrets, { recursive: true, mode: 0o700 });
      mkdirSync(bin, { recursive: true, mode: 0o700 });
      writeFileSync(join(root, '.finance-backup-test-fixture'), 'owned');
      writeFileSync(join(repo, '.finance-production-v01-owned'), 'b'.repeat(32), {
        mode: 0o600,
      });
      writeFileSync(join(root, '.finance-production-v01-active-slot'), 'slot-a\n');
      writeFileSync(
        join(root, '.finance-production-v01-success'),
        new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '\n',
      );
      for (const tool of ['restic', 'rclone', 'pg_restore']) {
        const file = join(bin, tool);
        writeFileSync(file, '#!/bin/sh\nexit 0\n');
        chmodSync(file, 0o700);
      }
      for (const file of ['pgpass', 'restic.password', 'rclone.conf']) {
        writeFileSync(join(secrets, file), 'test-fixture-only\n', { mode: 0o600 });
      }
      const env = {
          ...process.env,
          PATH: bin + ':' + process.env.PATH,
          FINANCE_PRODUCTION_SCHEDULE_ENABLED: 'yes',
          FINANCE_PRODUCTION_DISPOSABLE_TEST: 'yes',
          FINANCE_BACKUP_ALLOWED_DATABASE: 'finance_hub_prod',
          FINANCE_BACKUP_ROOT: root,
          FINANCE_RESTIC_REPOSITORY: repo,
          FINANCE_RCLONE_REMOTE: 'finance-drive:FinanceHub-Backups/finance-production-v01/test',
          PGHOST: 'postgres-products',
          PGPORT: '5432',
          PGUSER: 'backup_ro',
          PGPASSFILE: join(secrets, 'pgpass'),
          RESTIC_PASSWORD_FILE: join(secrets, 'restic.password'),
          RCLONE_CONFIG_FILE: join(secrets, 'rclone.conf'),
          RESTIC_PASSWORD: undefined,
          RESTIC_PASSWORD_COMMAND: undefined,
          PGPASSWORD: undefined,
          DATABASE_URL: undefined,
          RCLONE_CONFIG: undefined,
      };
      const result = spawnSync('bash', [script, 'status'], { encoding: 'utf8', env });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('OFFSITE_VERIFIED last_success=');
      const weekly = spawnSync('bash', [script, 'weekly-check'], { encoding: 'utf8', env });
      expect(weekly.status, weekly.stderr).toBe(0);
      expect(weekly.stdout).toContain('INTEGRITY_CHECK_COMPLETE');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
