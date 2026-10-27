import { describe, expect, it, vi } from 'vitest';
import {
  confirmationExpiry,
  confirmationReplyOutcome,
  isConfirmationExpired,
} from '../../domain/inbox/confirmation-session.js';
import { resolveContextualReply } from './confirmation.js';
import type { ConfirmationSessionRepository } from '../ports/confirmation-ports.js';

const now = new Date('2026-10-27T12:00:00.000Z');
const owner = {
  channel: 'whatsapp',
  senderReference: '5511999999999',
  authorizedSenderId: 'sender',
};

describe('Confirmation policy', () => {
  it('uses a 15-minute default TTL and expires at the exact boundary', () => {
    const expiry = confirmationExpiry(now);
    expect(expiry.toISOString()).toBe('2026-10-27T12:15:00.000Z');
    expect(isConfirmationExpired(expiry, new Date(expiry.getTime() - 1))).toBe(false);
    expect(isConfirmationExpired(expiry, expiry)).toBe(true);
  });

  it('rejects invalid TTL and maps contextual choices', () => {
    expect(() => confirmationExpiry(now, 0)).toThrow();
    expect(confirmationReplyOutcome('yes')).toBe('confirmed');
    expect(confirmationReplyOutcome('1')).toBe('choice');
    expect(confirmationReplyOutcome('no')).toBe('cancelled');
    expect(confirmationReplyOutcome('2')).toBe('choice');
  });

  it.each([
    ['sim', 'yes'],
    ['não', 'no'],
    ['1', '1'],
    ['2', '2'],
  ])('routes %s only to a current session', async (rawText, reply) => {
    const resolveReply = vi.fn().mockResolvedValue({ kind: 'none' });
    const repository = { resolveReply } as unknown as ConfirmationSessionRepository;
    await resolveContextualReply(repository, {
      ...owner,
      rawText,
      resolverInboxMessageId: 'resolver',
      attemptCount: 1,
      processingStartedAt: now,
      now,
    });
    expect(resolveReply).toHaveBeenCalledWith({
      ...owner,
      reply,
      resolverInboxMessageId: 'resolver',
      attemptCount: 1,
      processingStartedAt: now,
      now,
    });
  });

  it('does not route a complete command as a reply', async () => {
    const resolveReply = vi.fn();
    const repository = { resolveReply } as unknown as ConfirmationSessionRepository;
    expect(
      await resolveContextualReply(repository, {
        ...owner,
        rawText: 'gastei 10',
        resolverInboxMessageId: 'resolver',
        attemptCount: 1,
        processingStartedAt: now,
        now,
      }),
    ).toEqual({ kind: 'none' });
    expect(resolveReply).not.toHaveBeenCalled();
  });
});
