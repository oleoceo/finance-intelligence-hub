import { describe, it, expect } from 'vitest';
import { validateArchivableState, archiveEntity, reactivateEntity } from './lifecycle.js';
import type { ArchivableState } from './lifecycle.js';

describe('validateArchivableState', () => {
  it('accepts valid active state', () => {
    const state: ArchivableState = { active: true, archivedAt: null };
    expect(() => validateArchivableState(state)).not.toThrow();
  });

  it('accepts valid archived state', () => {
    const state: ArchivableState = { active: false, archivedAt: new Date('2026-01-01T00:00:00Z') };
    expect(() => validateArchivableState(state)).not.toThrow();
  });

  it('rejects active=true with non-null archivedAt', () => {
    const state: ArchivableState = { active: true, archivedAt: new Date() };
    expect(() => validateArchivableState(state)).toThrow(
      'Active entity cannot have archived_at set',
    );
  });

  it('rejects active=false with null archivedAt', () => {
    const state: ArchivableState = { active: false, archivedAt: null };
    expect(() => validateArchivableState(state)).toThrow(
      'Inactive entity must have archived_at set',
    );
  });
});

describe('archiveEntity', () => {
  it('sets active=false and archivedAt to provided time', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const state: ArchivableState = { active: true, archivedAt: null };
    const result = archiveEntity(state, now);
    expect(result.active).toBe(false);
    expect(result.archivedAt).toBe(now);
  });

  it('preserves existing archivedAt on repeated archive', () => {
    const originalArchiveTime = new Date('2026-01-01T00:00:00Z');
    const laterTime = new Date('2026-10-20T12:00:00Z');
    const state: ArchivableState = { active: false, archivedAt: originalArchiveTime };
    const result = archiveEntity(state, laterTime);
    expect(result.active).toBe(false);
    expect(result.archivedAt).toBe(originalArchiveTime);
  });
});

describe('reactivateEntity', () => {
  it('sets active=true and archivedAt=null', () => {
    const result = reactivateEntity();
    expect(result.active).toBe(true);
    expect(result.archivedAt).toBeNull();
  });
});
