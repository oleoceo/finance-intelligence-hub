import { v7 as uuidv7 } from 'uuid';
import { MasterDataError } from '../../domain/master-data/errors.js';
import {
  ConfigurationLockSetChangedError,
  type MasterDataTransactionContextT04,
  type LockSpec,
} from '../ports/master-data-ports.js';
import {
  validateChannel,
  validateSenderReference,
  validateDefaultConsistency,
  type CreateAuthorizedSenderInput,
  type UpdateAuthorizedSenderInput,
  type AuthorizedSenderRecord,
} from '../../domain/master-data/authorized-sender.js';

type Defaults = { defaultBookId?: string | null; defaultAccountId?: string | null };
const ids = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((id): id is string => id != null))].sort();
async function discover(
  defaults: Defaults[],
  ctx: MasterDataTransactionContextT04,
): Promise<LockSpec> {
  const books = defaults.map((d) => d.defaultBookId);
  const accounts = ids(defaults.map((d) => d.defaultAccountId));
  for (const id of accounts) books.push((await ctx.accounts.findById(id))?.bookId);
  return { books: ids(books), accounts };
}
async function checkLockSet(
  defaults: Defaults[],
  locks: LockSpec,
  ctx: MasterDataTransactionContextT04,
) {
  const current = await discover(defaults, ctx);
  for (const kind of ['books', 'accounts'] as const) {
    if (current[kind]?.some((id) => !locks[kind]?.includes(id)))
      throw new ConfigurationLockSetChangedError();
  }
}
async function validateDefaults(
  defaults: { defaultBookId: string | null; defaultAccountId: string | null },
  ctx: MasterDataTransactionContextT04,
) {
  validateDefaultConsistency(defaults);
  const book = defaults.defaultBookId ? await ctx.books.findById(defaults.defaultBookId) : null;
  const account = defaults.defaultAccountId
    ? await ctx.accounts.findById(defaults.defaultAccountId)
    : null;
  if (defaults.defaultBookId && !book)
    throw new MasterDataError('Default Book not found', 'BOOK_NOT_FOUND');
  if (defaults.defaultAccountId && !account)
    throw new MasterDataError('Default Account not found', 'ACCOUNT_NOT_FOUND');
  if (account && (account.bookId !== defaults.defaultBookId || account.currency !== book?.currency))
    throw new MasterDataError(
      'Default Account must belong to the specified Default Book and currency',
      'DEFAULT_ACCOUNT_BOOK_MISMATCH',
    );
  if (book && !book.active)
    throw new MasterDataError('Default Book must be active', 'BOOK_INACTIVE');
  if (account && !account.active)
    throw new MasterDataError('Default Account must be active', 'ACCOUNT_INACTIVE');
}
export async function createAuthorizedSender(
  input: CreateAuthorizedSenderInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<AuthorizedSenderRecord> {
  validateChannel(input.channel);
  validateSenderReference(input.senderReference);
  const defaults = {
    defaultBookId: input.defaultBookId ?? null,
    defaultAccountId: input.defaultAccountId ?? null,
  };
  const locks = await discover([defaults], ctx);
  await ctx.locks.acquireLocks(locks);
  await checkLockSet([defaults], locks, ctx);
  await validateDefaults(defaults, ctx);
  const record: AuthorizedSenderRecord = {
    id: uuidv7(),
    channel: input.channel,
    senderReference: input.senderReference,
    name: input.name ?? null,
    ...defaults,
    active: input.active ?? true,
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
  const discovered = await ctx.authorizedSenders.findById(input.id);
  if (!discovered) throw new MasterDataError('Authorized Sender not found', 'SENDER_NOT_FOUND');
  const locks = await discover([discovered, input], ctx);
  await ctx.locks.acquireLocks({ ...locks, authorizedSenders: [input.id] });
  const current = await ctx.authorizedSenders.findById(input.id);
  if (!current) throw new MasterDataError('Authorized Sender not found', 'SENDER_NOT_FOUND');
  const effective = {
    ...current,
    name: input.name === undefined ? current.name : input.name,
    active: input.active ?? current.active,
    defaultBookId: input.defaultBookId === undefined ? current.defaultBookId : input.defaultBookId,
    defaultAccountId:
      input.defaultAccountId === undefined ? current.defaultAccountId : input.defaultAccountId,
  };
  await checkLockSet([current, effective], locks, ctx);
  await validateDefaults(effective, ctx);
  return ctx.authorizedSenders.update({ ...effective, updatedAt: now });
}
