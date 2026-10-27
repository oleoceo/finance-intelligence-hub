export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';
export type ConfirmationReply = 'yes' | 'no' | '1' | '2';

export const DEFAULT_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export function confirmationExpiry(createdAt: Date, ttlMs = DEFAULT_CONFIRMATION_TTL_MS): Date {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Invalid confirmation TTL');
  return new Date(createdAt.getTime() + ttlMs);
}

export function isConfirmationExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function confirmationReplyOutcome(
  reply: ConfirmationReply,
): 'confirmed' | 'cancelled' | 'choice' {
  if (reply === 'yes') return 'confirmed';
  if (reply === 'no') return 'cancelled';
  return 'choice';
}
