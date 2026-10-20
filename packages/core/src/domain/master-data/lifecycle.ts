/**
 * Shared active/archived_at lifecycle semantics for Books, Accounts, Categories, and Merchants.
 *
 * Invariant:
 * - active = true  → archived_at = null
 * - active = false → archived_at != null
 */

export interface ArchivableState {
  active: boolean;
  archivedAt: Date | null;
}

/**
 * Validates the active/archived_at invariant.
 * Throws if the state is inconsistent.
 */
export function validateArchivableState(state: ArchivableState): void {
  if (state.active && state.archivedAt !== null) {
    throw new Error('Active entity cannot have archived_at set');
  }
  if (!state.active && state.archivedAt === null) {
    throw new Error('Inactive entity must have archived_at set');
  }
}

/**
 * Computes the next archivable state when archiving an entity.
 * If already archived, preserves the existing archivedAt timestamp.
 */
export function archiveEntity(currentState: ArchivableState, now: Date): ArchivableState {
  if (!currentState.active) {
    // Already archived; preserve existing timestamp
    return {
      active: false,
      archivedAt: currentState.archivedAt,
    };
  }

  return {
    active: false,
    archivedAt: now,
  };
}

/**
 * Computes the next archivable state when reactivating an entity.
 */
export function reactivateEntity(): ArchivableState {
  return {
    active: true,
    archivedAt: null,
  };
}
