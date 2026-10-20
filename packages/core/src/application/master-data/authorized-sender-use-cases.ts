/**
* Authorized Sender configuration use cases (M03-T04).
*
* Implements CreateAuthorizedSender, GetAuthorizedSender, ListAuthorizedSenders, UpdateAuthorizedSender.
* Core logic only; no Database/Kysely/pg/Fastify imports.
*/

import { v7 as uuidv7 } from 'uuid';
import type { MasterDataTransactionContextT04 } from '../ports/master-data-ports.js';
import {
  validateChannel,
  validateSenderReference,
  validateDefaultConsistency,
  type CreateAuthorizedSenderInput,
  type UpdateAuthorizedSenderInput,
  type AuthorizedSenderRecord,
} from '../../domain/master-data/authorized-sender.js';

export async function createAuthorizedSender(
  input: CreateAuthorizedSenderInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<AuthorizedSenderRecord> {
  // Validate inputs
  validateChannel(input.channel);
  validateSenderReference(input.senderReference);

  const defaultBookId = input.defaultBookId ?? null;
  const defaultAccountId = input.defaultAccountId ?? null;
  const active = input.active !== false;

  // Validate default consistency
  validateDefaultConsistency({ defaultBookId, defaultAccountId });

  // Lock referenced Books and Accounts if defaults provided
  const bookIds: string[] = [];
  const accountIds: string[] = [];

  if (defaultBookId) bookIds.push(defaultBookId);
  if (defaultAccountId) accountIds.push(defaultAccountId);

  // Discover Book from Account
  if (defaultAccountId) {
    const account = await ctx.accounts.findById(defaultAccountId);
    if (account && !bookIds.includes(account.bookId)) {
      bookIds.push(account.bookId);
    }
  }

  bookIds.sort();
  accountIds.sort();

  // Acquire locks in total entity rank order: Books > Accounts > Senders
  if (bookIds.length > 0) {
    await ctx.locks.acquireLocks({ books: bookIds });
  }

  // Re-read after locking to validate active state
  if (defaultBookId) {
    const book = await ctx.books.findById(defaultBookId);
    if (!book) throw new Error('Default Book not found');
    if (!book.active) throw new Error('Default Book must be active');
  }
  if (defaultAccountId) {
    const account = await ctx.accounts.findById(defaultAccountId);
    if (!account) throw new Error('Default Account not found');
    if (!account.active) throw new Error('Default Account must be active');

    // Verify Account belongs to the specified Book
    if (defaultBookId && account.bookId !== defaultBookId) {
      throw new Error('Default Account must belong to the specified Default Book');
    }
  }

  // Acquire Account locks after Books
  if (accountIds.length > 0) {
    await ctx.locks.acquireLocks({ accounts: accountIds });
  }

  // Check uniqueness before creating
  const existing = await ctx.authorizedSenders.findByChannelAndReference(
    input.channel.trim(),
    input.senderReference.trim(),
  );
  if (existing) {
    throw new Error('Authorized Sender with this channel and sender reference already exists');
  }

  // Generate UUIDv7
  const id = uuidv7();

  const record: AuthorizedSenderRecord = {
    id,
    channel: input.channel.trim(),
    senderReference: input.senderReference.trim(),
    name: input.name ?? null,
    defaultBookId,
    defaultAccountId,
    active,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.authorizedSenders.create(record);
  return record;
}

export async function getAuthorizedSender(
  id: string,
  ctx: MasterDataTransactionContextT04,
): Promise<AuthorizedSenderRecord | null> {
  return ctx.authorizedSenders.findById(id);
}

export async function listAuthorizedSenders(
  ctx: MasterDataTransactionContextT04,
): Promise<AuthorizedSenderRecord[]> {
  return ctx.authorizedSenders.find();
}

export async function updateAuthorizedSender(
  input: UpdateAuthorizedSenderInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<AuthorizedSenderRecord> {
  // First get sender to determine current defaults
  const existing = await ctx.authorizedSenders.findById(input.id);
  if (!existing) {
    throw new Error('Authorized Sender not found');
  }

  // Determine proposed defaults
  const proposedBookId = input.defaultBookId !== undefined ? input.defaultBookId : existing.defaultBookId;
  const proposedAccountId = input.defaultAccountId !== undefined ? input.defaultAccountId : existing.defaultAccountId;

  // Validate default consistency
  validateDefaultConsistency({ defaultBookId: proposedBookId, defaultAccountId: proposedAccountId });

  // Lock old and new Books/Accounts
  const bookIds: string[] = [];
  const accountIds: string[] = [];

  // Old defaults
  if (existing.defaultBookId && !bookIds.includes(existing.defaultBookId)) bookIds.push(existing.defaultBookId);
  if (existing.defaultAccountId && !accountIds.includes(existing.defaultAccountId)) accountIds.push(existing.defaultAccountId);

  // New defaults
  if (proposedBookId && !bookIds.includes(proposedBookId)) bookIds.push(proposedBookId);
  if (proposedAccountId && !accountIds.includes(proposedAccountId)) accountIds.push(proposedAccountId);

  // Discover Book from Account
  if (proposedAccountId) {
    const account = await ctx.accounts.findById(proposedAccountId);
    if (account && !bookIds.includes(account.bookId)) {
      bookIds.push(account.bookId);
    }
  }

  bookIds.sort();
  accountIds.sort();

  // Acquire locks in total entity rank order: Books > Accounts > Senders
  if (bookIds.length > 0) {
    await ctx.locks.acquireLocks({ books: bookIds });
  }

  // Re-read after locking
  const lockedExisting = await ctx.authorizedSenders.findById(input.id);
  if (!lockedExisting) throw new Error('Authorized Sender not found');

  if (accountIds.length > 0) {
    await ctx.locks.acquireLocks({ accounts: accountIds });
  }

  // Re-read defaults to validate active state
  if (proposedBookId) {
    const book = await ctx.books.findById(proposedBookId);
    if (!book) throw new Error('Default Book not found');
    if (!book.active) throw new Error('Default Book must be active');
  }
  if (proposedAccountId) {
    const account = await ctx.accounts.findById(proposedAccountId);
    if (!account) throw new Error('Default Account not found');
    if (!account.active) throw new Error('Default Account must be active');

    // Verify Account belongs to the specified Book
    if (proposedBookId && account.bookId !== proposedBookId) {
      throw new Error('Default Account must belong to the specified Default Book');
    }
  }

  const updated = await ctx.authorizedSenders.update({
    id: input.id,
    name: input.name !== undefined ? input.name : existing.name,
    defaultBookId: proposedBookId,
    defaultAccountId: proposedAccountId,
    active: input.active !== undefined ? input.active : existing.active,
    updatedAt: now,
  });

  return updated;
}