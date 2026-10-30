import type { InboxProcessingContext } from '../ports/financial-transaction-port.js';
import type { Interpretation } from '../ports/interpretation-ports.js';
import type { TransactionReadRecord } from '../ports/transaction-ports.js';
import { resolveInterpretation } from './resolve-interpretation.js';

export type MutationIntent = Extract<Interpretation, { kind: 'transaction_mutation' }>;
export type MutationProposal = {
  intent: MutationIntent;
  target: TransactionReadRecord;
  accountId?: string;
  accountName?: string;
  transactionDate?: string;
};

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A read-only proposal. Its target ID and version are immutable after display. */
export async function resolveMutation(
  ctx: InboxProcessingContext,
  intent: MutationIntent,
  senderReference: string,
  now: Date,
): Promise<
  | { kind: 'proposal'; value: MutationProposal }
  | { kind: 'choice'; options: TransactionReadRecord[] }
  | {
      kind: 'account_choice';
      target: TransactionReadRecord;
      transactionDate: string;
      options: { id: string; name: string }[];
    }
  | { kind: 'clarify' }
> {
  const book = await resolveInterpretation(
    {
      interpretation: { kind: 'query_last' },
      channel: 'whatsapp',
      senderReference,
      receivedAt: now,
      now,
    },
    { runInTransaction: async (fn) => fn(ctx) },
  );
  if (book.kind !== 'query_last') return { kind: 'clarify' };
  let candidates: TransactionReadRecord[] = [];
  if (intent.target === 'last') {
    const last = await ctx.reads.getLast({ bookId: book.bookId });
    if (last) candidates = [last];
  } else if (intent.target === 'reference') {
    const found = await ctx.transactions.findByHumanRef(intent.humanRef!);
    if (found?.bookId === book.bookId && found.status === 'posted')
      candidates = [{ ...found, isRefund: !!found.refundOfTransactionId }];
  } else {
    let context = intent.context!.trim();
    const dateMatch = context.match(/\b(\d{2}\/\d{2}(?:\/\d{4})?|\d{4}-\d{2}-\d{2})\b/u);
    let date: string | undefined;
    if (dateMatch) {
      const raw = dateMatch[1]!;
      if (raw.includes('/')) {
        const [day, month, year] = raw.split('/');
        date = `${year ?? localDate(now, 'UTC').slice(0, 4)}-${month}-${day}`;
      } else date = raw;
      context = context.replace(dateMatch[0], ' ');
    }
    const amountMatch = context.match(/(?:R\$\s*)?\b\d+(?:[.,]\d{1,2})?\b/u);
    let amount: string | undefined;
    if (amountMatch) {
      try {
        amount = canonicalizeMoneyAmount(amountMatch[0].replace(/^R\$\s*/u, '').replace(',', '.'));
      } catch {
        return { kind: 'clarify' };
      }
      context = context.replace(amountMatch[0], ' ');
    }
    const words = normalizeName(
      context.replace(/\b(?:compra|lançamento|lancamento|de|do|da|em)\b/giu, ' ').trim(),
    );
    const recent = await ctx.reads.list({ bookId: book.bookId, status: 'posted', pageSize: 100 });
    const merchants = await ctx.merchants.find();
    candidates = recent.items.filter((row) => {
      if (date && row.transactionDate !== date) return false;
      if (amount && row.amount !== amount) return false;
      if (!words) return true;
      const merchant = merchants.find((entry) => entry.id === row.merchantId);
      return (
        normalizeName(row.description).includes(words) || !!merchant?.normalizedName.includes(words)
      );
    });
  }
  if (intent.action === 'refund')
    candidates = candidates.filter((row) => row.type === 'expense' && !row.refundOfTransactionId);
  if (!candidates.length) return { kind: 'clarify' };
  if (candidates.length > 1)
    return candidates.length === 2 ? { kind: 'choice', options: candidates } : { kind: 'clarify' };
  const target = candidates[0]!;
  if (intent.action !== 'refund') return { kind: 'proposal', value: { intent, target } };
  const bookRecord = await ctx.books.findById(target.bookId);
  if (!bookRecord) return { kind: 'clarify' };
  const accounts = (await ctx.accounts.find()).filter(
    (row) => row.active && row.bookId === target.bookId && row.currency === target.currency,
  );
  if (accounts.length === 2)
    return {
      kind: 'account_choice',
      target,
      transactionDate: localDate(now, bookRecord.timezone),
      options: accounts
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, name }) => ({ id, name })),
    };
  if (accounts.length !== 1) return { kind: 'clarify' };
  return {
    kind: 'proposal',
    value: {
      intent,
      target,
      accountId: accounts[0]!.id,
      accountName: accounts[0]!.name,
      transactionDate: localDate(now, bookRecord.timezone),
    },
  };
}
import { canonicalizeMoneyAmount } from '../../domain/finance/money.js';
import { normalizeName } from '../../domain/master-data/normalization.js';
