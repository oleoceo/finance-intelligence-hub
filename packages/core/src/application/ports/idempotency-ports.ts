/**
 * Core-facing idempotency key ports for M04.
 *
 * T01 defines only the contract surface needed by T06/T07.
 * No persistence, fingerprint algorithm, concurrency, expiry or Redis here.
 *
 * Accepted conceptual states: in_progress, completed.
 * M04 create scope: transactions:create
 */

export const IDEMPOTENCY_STATES = ['in_progress', 'completed'] as const;
export type IdempotencyState = (typeof IDEMPOTENCY_STATES)[number];
export type IdempotencyScope = 'transactions:create';
export type IdempotencyFingerprint = string;

/**
 * Persistent idempotency key record.
 * Database adapter maps this to the idempotency_keys table.
 */
export interface IdempotencyKeyRecord {
  id: string;
  idempotencyKey: string;
  scope: IdempotencyScope;
  status: IdempotencyState;
  requestHash: IdempotencyFingerprint;
  resourceType: string | null;
  resourceId: string | null;
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Input for claiming an idempotency key at the start of a financial write.
 */
export interface CreateIdempotencyKeyInput {
  id: string;
  idempotencyKey: string;
  scope: IdempotencyScope;
  requestHash: IdempotencyFingerprint;
  createdAt: Date;
}

/**
 * Input for completing an idempotency key after successful commit.
 */
export interface CompleteIdempotencyKeyInput {
  id: string;
  resourceType: string;
  resourceId: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  completedAt: Date;
}

/**
 * Minimal idempotency key repository contract for M04.
 * T06 owns the PostgreSQL implementation and SHA-256 fingerprint.
 */
export interface IdempotencyKeyRepository {
  /**
   * Create an in_progress record. T06 defines conflict and replay handling.
   */
  create(input: CreateIdempotencyKeyInput): Promise<IdempotencyKeyRecord>;

  /**
   * Mark a previously created key as completed with replayable response data.
   * Called inside the same outer transaction as the financial write.
   */
  complete(input: CompleteIdempotencyKeyInput): Promise<IdempotencyKeyRecord>;

  /**
   * Look up an existing key without mutating state.
   */
  findByKeyAndScope(
    idempotencyKey: string,
    scope: IdempotencyScope,
  ): Promise<IdempotencyKeyRecord | null>;
}
