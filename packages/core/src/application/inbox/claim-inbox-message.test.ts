import { describe, expect, it, vi } from 'vitest';
import { claimInboxMessage, normalizeSenderReference } from './claim-inbox-message.js';
import type { InboxTransactionPort } from '../ports/inbox-ports.js';

const envelope = {
  source: 'whatsapp',
  sourceInstance: 'evolution-main/test',
  sourceMessageId: 'message-1',
  senderReference: '+55 (11) 99999-9999',
  receivedAt: new Date('2026-10-27T12:00:00Z'),
  rawText: 'private message',
  isGroup: false,
  fromMe: false,
};
const options = {
  id: '00000000-0000-0000-0000-000000000001',
  correlationId: '00000000-0000-0000-0000-000000000002',
  now: new Date('2026-10-27T12:01:00Z'),
  staleTimeoutMs: 60_000,
};

describe('Inbox claim policy', () => {
  it('filters group and from_me before opening a transaction', async () => {
    const runInTransaction = vi.fn();
    const port = { runInTransaction } as unknown as InboxTransactionPort;
    expect(await claimInboxMessage({ ...envelope, isGroup: true }, port, options)).toBeNull();
    expect(await claimInboxMessage({ ...envelope, fromMe: true }, port, options)).toBeNull();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('normalizes a phone reference and rejects invalid references', () => {
    expect(normalizeSenderReference(envelope.senderReference)).toBe('5511999999999');
    expect(() => normalizeSenderReference('user@example.com')).toThrow('Invalid sender reference');
  });

  it('does not call Inbox persistence for an absent or inactive sender', async () => {
    const claim = vi.fn();
    const sender = { id: 'sender-id', active: false };
    const findByChannelAndReference = vi.fn().mockResolvedValue(sender);
    const locks = { acquireLocks: vi.fn() };
    const port = {
      runInTransaction: async (fn: (ctx: unknown) => Promise<unknown>) =>
        fn({ senders: { findByChannelAndReference }, locks, inbox: { claim } }),
    } as InboxTransactionPort;
    await expect(claimInboxMessage(envelope, port, options)).rejects.toMatchObject({
      code: 'SENDER_NOT_AUTHORIZED',
      statusCode: 403,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it('locks and re-reads an active sender before passing raw text to Inbox', async () => {
    const sender = { id: 'sender-id', active: true };
    const findByChannelAndReference = vi.fn().mockResolvedValue(sender);
    const acquireLocks = vi.fn().mockResolvedValue(undefined);
    const claim = vi.fn().mockResolvedValue({ claimed: true });
    const port = {
      runInTransaction: async (fn: (ctx: unknown) => Promise<unknown>) =>
        fn({ senders: { findByChannelAndReference }, locks: { acquireLocks }, inbox: { claim } }),
    } as InboxTransactionPort;
    expect(await claimInboxMessage(envelope, port, options)).toEqual({ claimed: true });
    expect(acquireLocks).toHaveBeenCalledWith({ authorizedSenders: ['sender-id'] });
    expect(findByChannelAndReference).toHaveBeenCalledTimes(2);
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ senderReference: '5511999999999', rawText: envelope.rawText }),
      new Date('2026-10-27T12:00:00Z'),
    );
    expect(acquireLocks.mock.invocationCallOrder[0]).toBeLessThan(
      claim.mock.invocationCallOrder[0],
    );
  });
});
