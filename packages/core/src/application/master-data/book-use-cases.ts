/**
 * Book configuration use cases (M03-T02).
 *
 * Implements CreateBook, GetBook, ListBooks, UpdateBook, ArchiveBook.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */
import { v7 as uuidv7 } from 'uuid';
import { normalizeName, validateNonBlankName } from '../../domain/master-data/normalization.js';
import { archiveEntity } from '../../domain/master-data/lifecycle.js';
import { validateBookCurrencyChange } from '../../domain/master-data/immutability.js';
import { ValidationError, DependencyError } from '../../domain/master-data/errors.js';
import type { TransactionContext, BookRecord } from '../ports/master-data-ports.js';

export interface CreateBookInput {
  name: string;
  currency: string;
  timezone?: string;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const CURRENCY_REGEX = /^[A-Z]{3}$/;

function validateCurrency(currency: string): void {
  if (!CURRENCY_REGEX.test(currency)) {
    throw new ValidationError('Currency must be exactly 3 uppercase letters', 'currency');
  }
}

function validateTimezone(timezone: string): void {
  // Validate using Intl.DateTimeFormat which throws for invalid IANA timezones
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ValidationError(`Invalid IANA timezone: ${timezone}`, 'timezone');
  }
}

export async function createBook(
  input: CreateBookInput,
  ctx: TransactionContext,
  now: Date,
): Promise<BookRecord> {
  // Validate name
  const trimmedRaw = validateNonBlankName(input.name);
  const normalizedName = normalizeName(input.name);

  // Validate currency
  validateCurrency(input.currency);

  // Validate timezone
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  validateTimezone(timezone);

  // Generate UUIDv7
  const id = uuidv7();

  const record: BookRecord = {
    id,
    name: trimmedRaw,
    normalizedName,
    currency: input.currency,
    timezone,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.books.create(record);
  return record;
}

export async function getBook(id: string, ctx: TransactionContext): Promise<BookRecord | null> {
  return ctx.books.findById(id);
}

export async function listBooks(ctx: TransactionContext): Promise<BookRecord[]> {
  return ctx.books.find();
}

export interface UpdateBookInput {
  id: string;
  active?: boolean;
  name?: string;
  currency?: string;
  timezone?: string;
}

export async function updateBook(
  input: UpdateBookInput,
  ctx: TransactionContext,
  now: Date,
): Promise<BookRecord> {
  // Acquire Book lock first before any validation that depends on Book state
  await ctx.locks.acquireLocks({ books: [input.id] });

  // Re-read Book after lock to use authoritative state
  const existing = await ctx.books.findById(input.id);
  if (!existing) {
    throw new Error('Book not found');
  }

  let newName = existing.name;
  let newNormalizedName = existing.normalizedName;
  let newCurrency = existing.currency;
  let newTimezone = existing.timezone;

  // Handle name update
  if (input.name !== undefined) {
    validateNonBlankName(input.name);
    newName = validateNonBlankName(input.name);
    newNormalizedName = normalizeName(input.name);
  }

  // Handle currency update
  if (input.currency !== undefined) {
    validateCurrency(input.currency);
    newCurrency = input.currency;
  }

  // Handle timezone update
  if (input.timezone !== undefined) {
    validateTimezone(input.timezone);
    newTimezone = input.timezone;
  }

  // Check currency immutability using re-read state
  if (input.currency !== undefined && input.currency !== existing.currency) {
    const accounts = await ctx.accounts.findByBookId(input.id);
    const hasTransactions = await ctx.financialUsage.hasBookUsage(input.id);

    validateBookCurrencyChange(existing.currency, input.currency, {
      hasAccounts: accounts.length > 0,
      hasTransactions,
    });
  }

  if (input.active === false && (await ctx.senderDefaults.hasBookDefault(input.id))) {
    throw new DependencyError('Cannot archive Book referenced as Authorized Sender default');
  }
  const updated = await ctx.books.update({
    id: input.id,
    name: newName,
    normalizedName: newNormalizedName,
    currency: newCurrency,
    timezone: newTimezone,
    updatedAt: now,
  });

  if (input.active !== undefined) {
    const lifecycle = input.active
      ? { active: true, archivedAt: null }
      : archiveEntity(existing, now);
    return ctx.books.archive({ id: input.id, ...lifecycle, updatedAt: now });
  }
  return updated;
}

export async function archiveBook(
  id: string,
  ctx: TransactionContext,
  now: Date,
): Promise<BookRecord> {
  // Acquire Book lock first following shared lock protocol
  await ctx.locks.acquireLocks({ books: [id] });

  // Re-read Book after lock
  const existing = await ctx.books.findById(id);
  if (!existing) {
    throw new Error('Book not found');
  }

  // Check sender default references within the same transaction
  const isReferenced = await ctx.senderDefaults.hasBookDefault(id);
  if (isReferenced) {
    throw new DependencyError('Cannot archive Book referenced as Authorized Sender default');
  }

  const lifecycleState = archiveEntity(
    { active: existing.active, archivedAt: existing.archivedAt },
    now,
  );

  const archived = await ctx.books.archive({
    id,
    active: lifecycleState.active,
    archivedAt: lifecycleState.archivedAt,
    updatedAt: now,
  });

  return archived;
}
