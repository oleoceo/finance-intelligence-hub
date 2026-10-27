import { canonicalizeMoneyAmount } from '../../domain/finance/money.js';
import { normalizeName } from '../../domain/master-data/normalization.js';
import {
  ConfigurationLockSetChangedError,
  type MasterDataTransactionContextT04,
  type TransactionPort,
} from '../ports/master-data-ports.js';
import type {
  BookRecord,
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
} from '../ports/master-data-ports.js';
import type { ClassificationRuleRecord } from '../../domain/master-data/classification-rule.js';
import type { AuthorizedSenderRecord } from '../../domain/master-data/authorized-sender.js';
import type {
  CreateCandidate,
  ExplicitValue,
  Interpretation,
  ResolutionResult,
} from '../ports/interpretation-ports.js';

type Snapshot = {
  books: BookRecord[];
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  merchants: MerchantRecord[];
  rules: ClassificationRuleRecord[];
  sender: AuthorizedSenderRecord | null;
};
type Field = Extract<ResolutionResult, { kind: 'clarification' }>['field'];
const clarification = (
  field: Field,
  reason: 'missing' | 'ambiguous' | 'invalid' | 'future',
): ResolutionResult => ({ kind: 'clarification', field, reason });

async function snapshot(
  ctx: MasterDataTransactionContextT04,
  channel: string,
  senderReference: string,
): Promise<Snapshot> {
  const [books, accounts, categories, merchants, rules, sender] = await Promise.all([
    ctx.books.find(),
    ctx.accounts.find(),
    ctx.categories.find(),
    ctx.merchants.find(),
    ctx.classificationRules.find(),
    ctx.authorizedSenders.findByChannelAndReference(channel, senderReference),
  ]);
  return { books, accounts, categories, merchants, rules, sender };
}

function identities(rows: { id: string }[]): string[] {
  return rows.map((r) => r.id).sort();
}
function sameIds(a: Snapshot, b: Snapshot): boolean {
  return (
    (['books', 'accounts', 'categories', 'merchants', 'rules'] as const).every(
      (key) => JSON.stringify(identities(a[key])) === JSON.stringify(identities(b[key])),
    ) && a.sender?.id === b.sender?.id
  );
}

/** The complete discovered set is locked once, in the M03 rank order. */
async function lockedSnapshot(
  ctx: MasterDataTransactionContextT04,
  channel: string,
  senderReference: string,
): Promise<Snapshot> {
  const discovered = await snapshot(ctx, channel, senderReference);
  await ctx.locks.acquireLocks({
    books: identities(discovered.books),
    accounts: identities(discovered.accounts),
    categories: identities(discovered.categories),
    merchants: identities(discovered.merchants),
    classificationRules: identities(discovered.rules),
    authorizedSenders: discovered.sender ? [discovered.sender.id] : [],
  });
  const current = await snapshot(ctx, channel, senderReference);
  if (!sameIds(discovered, current)) throw new ConfigurationLockSetChangedError();
  return current;
}

function reference<T extends { id: string; normalizedName: string; active: boolean }>(
  rows: T[],
  input: ExplicitValue<string> | undefined,
  field: Field,
): T | ResolutionResult | undefined {
  if (!input) return undefined;
  const key = normalizeName(input.value);
  const matches = rows.filter((row) => row.id === input.value || row.normalizedName === key);
  if (matches.length > 1) return clarification(field, 'ambiguous');
  if (matches.length !== 1 || !matches[0]!.active) return clarification(field, 'invalid');
  return matches[0];
}

function isResult(value: unknown): value is ResolutionResult {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function matchingRules(candidate: CreateCandidate, state: Snapshot): ClassificationRuleRecord[] {
  const text = normalizeName(candidate.description?.value ?? '');
  return state.rules
    .filter((rule) => {
      if (!rule.active || !rule.normalizedPattern || !text) return false;
      const matches =
        rule.matchType === 'exact'
          ? text === rule.normalizedPattern
          : text.includes(rule.normalizedPattern);
      if (!matches) return false;
      const book = rule.targetBookId
        ? state.books.find((row) => row.id === rule.targetBookId && row.active)
        : undefined;
      const account = rule.targetAccountId
        ? state.accounts.find((row) => row.id === rule.targetAccountId && row.active)
        : undefined;
      const category = rule.targetCategoryId
        ? state.categories.find(
            (row) =>
              row.id === rule.targetCategoryId &&
              row.active &&
              (row.type === candidate.transactionType.value ||
                (row.type === 'both' && candidate.transactionType.value !== 'transfer')),
          )
        : undefined;
      const merchant = rule.targetMerchantId
        ? state.merchants.find((row) => row.id === rule.targetMerchantId && row.active)
        : undefined;
      if (
        (rule.targetBookId && !book) ||
        (rule.targetAccountId && !account) ||
        (rule.targetCategoryId && !category) ||
        (rule.targetMerchantId && !merchant)
      )
        return false;
      if (candidate.transactionType.value === 'transfer' && (category || merchant)) return false;
      const bookIds = [book?.id, account?.bookId, category?.bookId].filter(Boolean);
      if (new Set(bookIds).size > 1) return false;
      const effectiveBook = state.books.find((row) => row.id === bookIds[0] && row.active);
      if (bookIds.length && !effectiveBook) return false;
      if (account && effectiveBook && account.currency !== effectiveBook.currency) return false;
      return true;
    })
    .map((rule) => ({
      ...rule,
      targetBookId:
        rule.targetBookId ??
        state.accounts.find((a) => a.id === rule.targetAccountId)?.bookId ??
        state.categories.find((c) => c.id === rule.targetCategoryId)?.bookId ??
        null,
    }))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

function ruleTarget<T extends { id: string }>(
  rules: ClassificationRuleRecord[],
  target: keyof ClassificationRuleRecord,
  eligible: T[],
  field: Field,
): T | ResolutionResult | undefined {
  const applicable = rules.filter(
    (rule) => rule[target] && eligible.some((row) => row.id === rule[target]),
  );
  if (!applicable.length) return undefined;
  const priority = applicable[0]!.priority;
  const ids = [
    ...new Set(applicable.filter((rule) => rule.priority === priority).map((rule) => rule[target])),
  ];
  if (ids.length > 1) return clarification(field, 'ambiguous');
  return eligible.find((row) => row.id === ids[0]);
}

function chooseOne<T>(rows: T[], field: Field): T | ResolutionResult {
  return rows.length === 1 ? rows[0]! : clarification(field, rows.length ? 'ambiguous' : 'missing');
}

function localDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function shift(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function financialDate(
  candidate: CreateCandidate,
  timezone: string,
  receivedAt: Date,
  now: Date,
): string | ResolutionResult {
  const received = localDate(receivedAt, timezone);
  const today = localDate(now, timezone);
  const expression = candidate.date?.value;
  let date = received;
  if (expression?.kind === 'relative') {
    date = shift(
      received,
      expression.value === 'hoje' ? 0 : expression.value === 'ontem' ? -1 : -2,
    );
  } else if (expression?.kind === 'pt_br') {
    const match = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/.exec(expression.value);
    if (!match) return clarification('date', 'invalid');
    date = `${match[3] ?? received.slice(0, 4)}-${match[2]}-${match[1]}`;
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
      return clarification('date', 'invalid');
  }
  return date > today ? clarification('date', 'future') : date;
}

function resolveCreate(
  candidate: CreateCandidate,
  state: Snapshot,
  receivedAt: Date,
  now: Date,
): ResolutionResult {
  const activeBooks = state.books.filter((b) => b.active);
  const explicitBook = reference(state.books, candidate.book, 'book');
  if (isResult(explicitBook)) return explicitBook;
  const rules = matchingRules(candidate, state);
  const ruleBook = explicitBook
    ? undefined
    : ruleTarget(rules, 'targetBookId', activeBooks, 'book');
  if (isResult(ruleBook)) return ruleBook;
  const senderBook = activeBooks.find((b) => b.id === state.sender?.defaultBookId);
  const book = explicitBook ?? ruleBook ?? senderBook ?? chooseOne(activeBooks, 'book');
  if (isResult(book)) return book;
  const bookRules = rules.filter(
    (rule) =>
      (!rule.targetBookId || rule.targetBookId === book.id) &&
      (!rule.targetAccountId ||
        state.accounts.some((a) => a.id === rule.targetAccountId && a.bookId === book.id)) &&
      (!rule.targetCategoryId ||
        state.categories.some((c) => c.id === rule.targetCategoryId && c.bookId === book.id)),
  );

  const eligibleAccounts = state.accounts.filter(
    (a) => a.active && a.bookId === book.id && a.currency === book.currency,
  );
  const explicitAccount = reference(eligibleAccounts, candidate.account, 'account');
  if (isResult(explicitAccount)) return explicitAccount;
  if (explicitAccount && !eligibleAccounts.some((a) => a.id === explicitAccount.id))
    return clarification('account', 'invalid');
  const ruleAccount = explicitAccount
    ? undefined
    : ruleTarget(bookRules, 'targetAccountId', eligibleAccounts, 'account');
  if (isResult(ruleAccount)) return ruleAccount;
  const senderAccount = eligibleAccounts.find((a) => a.id === state.sender?.defaultAccountId);
  const account =
    explicitAccount ?? ruleAccount ?? senderAccount ?? chooseOne(eligibleAccounts, 'account');
  if (isResult(account)) return account;

  let destination: AccountRecord | undefined;
  if (candidate.transactionType.value === 'transfer') {
    if (candidate.category) return clarification('category', 'invalid');
    if (candidate.merchant) return clarification('merchant', 'invalid');
    const explicitDestination = reference(
      eligibleAccounts,
      candidate.destinationAccount,
      'destinationAccount',
    );
    if (isResult(explicitDestination)) return explicitDestination;
    if (
      !explicitDestination ||
      !eligibleAccounts.some((a) => a.id === explicitDestination.id) ||
      explicitDestination.id === account.id
    )
      return clarification('destinationAccount', 'invalid');
    destination = explicitDestination;
  }

  const eligibleCategories = state.categories.filter(
    (c) =>
      c.active &&
      c.bookId === book.id &&
      (c.type === candidate.transactionType.value || c.type === 'both'),
  );
  const explicitCategory = reference(eligibleCategories, candidate.category, 'category');
  if (isResult(explicitCategory)) return explicitCategory;
  if (explicitCategory && !eligibleCategories.some((c) => c.id === explicitCategory.id))
    return clarification('category', 'invalid');
  const ruleCategory = explicitCategory
    ? undefined
    : ruleTarget(bookRules, 'targetCategoryId', eligibleCategories, 'category');
  if (isResult(ruleCategory)) return ruleCategory;
  const category = explicitCategory ?? ruleCategory;

  const activeMerchants = state.merchants.filter((m) => m.active);
  const explicitMerchant = reference(state.merchants, candidate.merchant, 'merchant');
  if (isResult(explicitMerchant)) return explicitMerchant;
  const ruleMerchant = explicitMerchant
    ? undefined
    : ruleTarget(bookRules, 'targetMerchantId', activeMerchants, 'merchant');
  if (isResult(ruleMerchant)) return ruleMerchant;
  const merchant = explicitMerchant ?? ruleMerchant;

  if (!candidate.amount) return clarification('amount', 'missing');
  const description =
    candidate.description?.value.trim() ||
    (destination ? `${account.name} para ${destination.name}` : '');
  if (!description) return clarification('description', 'missing');
  let amount: string;
  try {
    amount = canonicalizeMoneyAmount(candidate.amount.value);
  } catch {
    return clarification('amount', 'invalid');
  }
  const date = financialDate(candidate, book.timezone, receivedAt, now);
  if (isResult(date)) return date;
  const base = {
    bookId: book.id,
    accountId: account.id,
    amount,
    description,
    transactionDate: date,
  };
  if (destination)
    return {
      kind: 'create',
      input: { ...base, type: 'transfer', destinationAccountId: destination.id },
      dateProvenance: candidate.date ? 'explicit_input' : 'received_local_date',
    };
  return {
    kind: 'create',
    input: {
      ...base,
      type: candidate.transactionType.value as 'expense' | 'income',
      categoryId: category?.id ?? null,
      merchantId: merchant?.id ?? null,
    },
    dateProvenance: candidate.date ? 'explicit_input' : 'received_local_date',
  };
}

/** Resolution remains read only. P05 must revalidate at the M04 write boundary. */
export async function resolveInterpretation(
  input: {
    interpretation: Interpretation;
    channel: string;
    senderReference: string;
    receivedAt: Date;
    now: Date;
  },
  transactions: TransactionPort<MasterDataTransactionContextT04>,
): Promise<ResolutionResult> {
  const interpretation = input.interpretation;
  if (interpretation.kind !== 'create_transaction' && interpretation.kind !== 'query_last')
    return clarification('intent', 'invalid');
  return transactions.runInTransaction(async (ctx) => {
    const state = await lockedSnapshot(ctx, input.channel, input.senderReference);
    if (!state.sender?.active) return clarification('intent', 'invalid');
    if (interpretation.kind === 'create_transaction')
      return resolveCreate(interpretation, state, input.receivedAt, input.now);
    const explicit = reference(state.books, interpretation.book, 'book');
    if (isResult(explicit)) return explicit;
    const activeBooks = state.books.filter((b) => b.active);
    const book =
      explicit ??
      activeBooks.find((b) => b.id === state.sender?.defaultBookId) ??
      chooseOne(activeBooks, 'book');
    return isResult(book) ? book : { kind: 'query_last', bookId: book.id };
  });
}
