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

/**
 * Persistent idempotency key record.
 * Database adapter maps this to the idempotency_keys table.
 */
export interface IdempotencyKeyRecord {
  idempotencyKey: string;
  scope: string;
  state: IdempotencyState;
  /** Deterministic fingerprint of the request payload. Opaque to Core. */
  fingerprint: string;
  /** Result payload for completed keys (serialized). Null while in_progress. */
  resultPayload: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for claiming an idempotency key at the start of a financial write.
 */
export interface ClaimIdempotencyKeyInput {
  idempotencyKey: string;
  scope: string;
  fingerprint: string;
}

/**
 * Input for completing an idempotency key after successful commit.
 */
export interface CompleteIdempotencyKeyInput {
  idempotencyKey: string;
  scope: string;
  resultPayload: string;
}

/**
 * Minimal idempotency key repository contract for M04.
 * T06 owns the PostgreSQL implementation and SHA-256 fingerprint.
 */
export interface IdempotencyKeyRepository {
  /**
   * Attempt to claim a key. Returns the existing record if already present,
   * or creates a new in_progress record. Caller inspects state + fingerprint
   * to decide whether to proceed, replay or reject.
   */
  claim(input: ClaimIdempotencyKeyInput): Promise<IdempotencyKeyRecord>;

  /**
   * Mark a previously claimed key as completed with its result payload.
   * Called inside the same outer transaction as the financial write.
   */
  complete(input: CompleteIdempotencyKeyInput): Promise<IdempotencyKeyRecord>;

  /**
   * Look up an existing key without mutating state.
   */
  findByKeyAndScope(idempotencyKey: string, scope: string): Promise<IdempotencyKeyRecord | null>;
}
