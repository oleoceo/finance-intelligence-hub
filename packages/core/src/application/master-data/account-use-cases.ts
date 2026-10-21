/**
 * Account configuration use cases (M03-T02).
 *
 * Implements CreateAccount, GetAccount, ListAccounts, UpdateAccount, ArchiveAccount.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */
import { v7 as uuidv7 } from 'uuid';
import { normalizeName, validateNonBlankName } from '../../domain/master-data/normalization.js';
import { archiveEntity } from '../../domain/master-data/lifecycle.js';
import { validateAccountImmutableFields } from '../../domain/master-data/immutability.js';
import {
  ValidationError,
  DependencyError,
  MasterDataError,
} from '../../domain/master-data/errors.js';
import type { TransactionContext, AccountRecord } from '../ports/master-data-ports.js';

export interface CreateAccountInput {
  bookId: string;
  name: string;
  type: string;
  institutionName?: string | null;
  notes?: string | null;
}

const VALID_ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'credit_card', 'other'] as const;

function validateAccountType(type: string): void {
  if (!VALID_ACCOUNT_TYPES.includes(type as (typeof VALID_ACCOUNT_TYPES)[number])) {
    throw new ValidationError(
      `Account type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
      'type',
    );
  }
}

export async function createAccount(
  input: CreateAccountInput,
  ctx: TransactionContext,
  now: Date,
): Promise<AccountRecord> {
  // Validate account type
  validateAccountType(input.type);

  // Validate name
  const trimmedRaw = validateNonBlankName(input.name);
  const normalizedName = normalizeName(input.name);

  // Lock Book first to prevent races with Book archive/currency change
  await ctx.locks.acquireLocks({ books: [input.bookId] });

  // Re-read Book state after lock
  const book = await ctx.books.findById(input.bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  // Book must be active
  if (!book.active) {
    throw new ValidationError('Cannot create Account for inactive Book', 'bookId');
  }

  // Derive currency from Book (immutable constraint)
  const currency = book.currency;

  // Generate UUIDv7
  const id = uuidv7();

  const record: AccountRecord = {
    id,
    bookId: input.bookId,
    name: trimmedRaw,
    normalizedName,
    type: input.type,
    currency,
    institutionName: input.institutionName ?? null,
    notes: input.notes ?? null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.accounts.create(record);
  return record;
}

export async function getAccount(
  id: string,
  ctx: TransactionContext,
): Promise<AccountRecord | null> {
  return ctx.accounts.findById(id);
}

export async function listAccounts(ctx: TransactionContext): Promise<AccountRecord[]> {
  return ctx.accounts.find();
}

export interface UpdateAccountInput {
  id: string;
  currency?: string;
  active?: boolean;
  name?: string;
  type?: string;
  institutionName?: string | null;
  notes?: string | null;
}

export async function updateAccount(
  input: UpdateAccountInput,
  ctx: TransactionContext,
  now: Date,
): Promise<AccountRecord> {
  // First get account to determine which Book to lock
  const existing = await ctx.accounts.findById(input.id);
  if (!existing) {
    throw new Error('Account not found');
  }

  // Lock Book then Account (deterministic order)
  await ctx.locks.acquireLocks({ books: [existing.bookId], accounts: [input.id] });

  // Re-read current state after locks
  const current = await ctx.accounts.findById(input.id);
  if (!current) {
    throw new Error('Account not found');
  }

  let newName = current.name;
  let newNormalizedName = current.normalizedName;
  let newType = current.type;
  let newInstitutionName = current.institutionName;
  let newNotes = current.notes;

  // Handle name update
  if (input.name !== undefined) {
    validateNonBlankName(input.name);
    newName = validateNonBlankName(input.name);
    newNormalizedName = normalizeName(input.name);
  }

  // Handle type update
  if (input.type !== undefined) {
    validateAccountType(input.type);
    newType = input.type;
  }

  // Check if type actually changed
  if (
    (input.type !== undefined && input.type !== current.type) ||
    (input.currency !== undefined && input.currency !== current.currency)
  ) {
    // Check financial usage through FinancialUsageReader
    const hasFinancialUsage = await ctx.financialUsage.hasAccountUsage(input.id);

    // Validate immutability (currency doesn't change independently, it's derived from Book)
    validateAccountImmutableFields(
      current.currency,
      input.currency ?? current.currency,
      current.type,
      newType,
      {
        hasFinancialUsage,
      },
    );
  }

  if (input.active === false && (await ctx.senderDefaults.hasAccountDefault(input.id))) {
    throw new DependencyError('Cannot archive Account referenced as Authorized Sender default');
  }
  if (input.currency !== undefined) {
    const book = await ctx.books.findById(current.bookId);
    if (!book) throw new MasterDataError('Book not found', 'BOOK_NOT_FOUND');
    if (input.currency !== book.currency)
      throw new MasterDataError('Account currency must equal Book currency', 'CURRENCY_MISMATCH');
  }

  // Handle optional fields
  if (input.institutionName !== undefined) {
    newInstitutionName = input.institutionName;
  }
  if (input.notes !== undefined) {
    newNotes = input.notes;
  }

  const updated = await ctx.accounts.update({
    id: input.id,
    name: newName,
    normalizedName: newNormalizedName,
    type: newType,
    currency: input.currency ?? current.currency,
    institutionName: newInstitutionName,
    notes: newNotes,
    updatedAt: now,
  });

  if (input.active !== undefined) {
    const lifecycle = input.active
      ? { active: true, archivedAt: null }
      : archiveEntity(current, now);
    return ctx.accounts.archive({ id: input.id, ...lifecycle, updatedAt: now });
  }
  return updated;
}

export async function archiveAccount(
  id: string,
  ctx: TransactionContext,
  now: Date,
): Promise<AccountRecord> {
  // First get account to determine which Book to lock
  const existing = await ctx.accounts.findById(id);
  if (!existing) {
    throw new Error('Account not found');
  }

  // Lock Book then Account (deterministic order)
  await ctx.locks.acquireLocks({ books: [existing.bookId], accounts: [id] });

  // Re-read current state after locks
  const current = await ctx.accounts.findById(id);
  if (!current) {
    throw new Error('Account not found');
  }

  // Check sender default references
  const isReferenced = await ctx.senderDefaults.hasAccountDefault(id);
  if (isReferenced) {
    throw new DependencyError('Cannot archive Account referenced as Authorized Sender default');
  }

  const lifecycleState = archiveEntity(
    { active: current.active, archivedAt: current.archivedAt },
    now,
  );

  const archived = await ctx.accounts.archive({
    id,
    active: lifecycleState.active,
    archivedAt: lifecycleState.archivedAt,
    updatedAt: now,
  });

  return archived;
}
