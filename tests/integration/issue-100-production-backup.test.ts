import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
});
