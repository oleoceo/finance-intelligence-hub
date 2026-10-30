import { describe, expect, it } from 'vitest';
import { resolveInterpretation } from './resolve-interpretation.js';
import type { Interpretation } from '../ports/interpretation-ports.js';
import type {
  MasterDataTransactionContextT04,
  TransactionPort,
  BookRecord,
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
} from '../ports/master-data-ports.js';
import type { ClassificationRuleRecord } from '../../domain/master-data/classification-rule.js';
import type { AuthorizedSenderRecord } from '../../domain/master-data/authorized-sender.js';

const now = new Date('2026-10-27T02:00:00.000Z');
const stamp = new Date('2026-10-26T12:00:00.000Z');
const value = <T>(input: T) => ({
  value: input,
  raw: String(input),
  provenance: 'explicit_input' as const,
});
const book = (id: string, active = true, timezone = 'America/Sao_Paulo'): BookRecord => ({
  id,
  name: id,
  normalizedName: id,
  currency: 'BRL',
  timezone,
  active,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
});
const account = (id: string, bookId: string, active = true): AccountRecord => ({
  id,
  bookId,
  name: id,
  normalizedName: id,
  type: 'checking',
  currency: 'BRL',
  institutionName: null,
  notes: null,
  active,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
});
const category = (id: string, bookId: string, type = 'expense'): CategoryRecord => ({
  id,
  bookId,
  name: id,
  normalizedName: id,
  parentCategoryId: null,
  type,
  active: true,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
});
const merchant = (id: string): MerchantRecord => ({
  id,
  name: id,
  normalizedName: id,
  type: null,
  taxIdentifier: null,
  active: true,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
});
const rule = (
  id: string,
  priority: number,
  targets: Partial<ClassificationRuleRecord>,
): ClassificationRuleRecord => ({
  id,
  priority,
  active: true,
  matchType: 'contains',
  pattern: 'cafe',
  normalizedPattern: 'cafe',
  targetBookId: null,
  targetAccountId: null,
  targetCategoryId: null,
  targetMerchantId: null,
  source: 'manual',
  createdAt: stamp,
  updatedAt: stamp,
  ...targets,
});
const sender = (
  defaultBookId: string | null,
  defaultAccountId: string | null,
): AuthorizedSenderRecord => ({
  id: 'sender',
  channel: 'whatsapp',
  senderReference: '5511',
  name: null,
  defaultBookId,
  defaultAccountId,
  active: true,
  createdAt: stamp,
  updatedAt: stamp,
});
const create = (
  fields: Partial<Extract<Interpretation, { kind: 'create_transaction' }>> = {},
): Extract<Interpretation, { kind: 'create_transaction' }> => ({
  kind: 'create_transaction',
  transactionType: value('expense'),
  amount: value('10.00'),
  description: value('cafe'),
  ...fields,
});
type State = {
  books: BookRecord[];
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  merchants: MerchantRecord[];
  rules: ClassificationRuleRecord[];
  sender: AuthorizedSenderRecord | null;
};
const base = (): State => ({
  books: [book('pessoal'), book('empresa')],
  accounts: [
    account('cash', 'pessoal'),
    account('bank', 'pessoal'),
    account('corporate', 'empresa'),
  ],
  categories: [],
  merchants: [],
  rules: [],
  sender: sender('pessoal', 'cash'),
});

function port(state: State): TransactionPort<MasterDataTransactionContextT04> {
  const context = {
    books: { find: async () => state.books },
    accounts: { find: async () => state.accounts },
    categories: { find: async () => state.categories },
    merchants: { find: async () => state.merchants },
    classificationRules: { find: async () => state.rules },
    authorizedSenders: { findByChannelAndReference: async () => state.sender },
    locks: { acquireLocks: async () => {} },
  } as unknown as MasterDataTransactionContextT04;
  return {
    runInTransaction: async <T>(fn: (ctx: MasterDataTransactionContextT04) => Promise<T>) =>
      fn(context),
  };
}
function resolve(interpretation: Interpretation, state = base(), receivedAt = now) {
  return resolveInterpretation(
    { interpretation, channel: 'whatsapp', senderReference: '5511', receivedAt, now },
    port(state),
  );
}

describe('P03 configuration resolution', () => {
  it('keeps explicit Book and Account ahead of rules and defaults', async () => {
    const state = base();
    state.rules.push(rule('r', 1, { targetBookId: 'pessoal', targetAccountId: 'cash' }));
    expect(
      await resolve(create({ book: value('empresa'), account: value('corporate') }), state),
    ).toMatchObject({ kind: 'create', input: { bookId: 'empresa', accountId: 'corporate' } });
  });
  it('uses a compatible rule before sender defaults', async () => {
    const state = base();
    state.rules.push(rule('r', 1, { targetBookId: 'empresa', targetAccountId: 'corporate' }));
    expect(await resolve(create(), state)).toMatchObject({
      kind: 'create',
      input: { bookId: 'empresa', accountId: 'corporate' },
    });
  });
  it('falls back to a single active Book and Account when defaults are invalid', async () => {
    const state = base();
    state.books = [book('pessoal'), book('empresa', false)];
    state.accounts = [account('cash', 'pessoal'), account('bank', 'pessoal', false)];
    state.sender = sender('empresa', 'bank');
    expect(await resolve(create(), state)).toMatchObject({
      kind: 'create',
      input: { bookId: 'pessoal', accountId: 'cash' },
    });
  });
  it('asks for Book and Account when zero or multiple candidates remain', async () => {
    const state = base();
    state.sender = sender(null, null);
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'ambiguous',
    });
    state.books = [book('pessoal')];
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'ambiguous',
    });
    state.accounts = [];
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'missing',
    });
    state.books = [];
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'missing',
    });
  });
  it('rejects explicit inactive or cross-Book references without fallback', async () => {
    const state = base();
    state.accounts.push(account('closed', 'pessoal', false));
    expect(await resolve(create({ account: value('closed') }), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'invalid',
    });
    expect(await resolve(create({ account: value('corporate') }), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'invalid',
    });
  });
  it('excludes wrong-currency Accounts and ignores a conflicting sender Account default', async () => {
    const state = base();
    state.accounts.find((a) => a.id === 'cash')!.currency = 'USD';
    state.sender = sender('pessoal', 'corporate');
    expect(await resolve(create(), state)).toMatchObject({
      kind: 'create',
      input: { bookId: 'pessoal', accountId: 'bank' },
    });
    expect(await resolve(create({ account: value('cash') }), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'invalid',
    });
  });
  it('resolves repeated Account and Category names within the chosen Book', async () => {
    const state = base();
    state.accounts.find((a) => a.id === 'cash')!.normalizedName = 'shared';
    state.accounts.find((a) => a.id === 'corporate')!.normalizedName = 'shared';
    state.categories.push(category('food', 'pessoal'), category('other-food', 'empresa'));
    state.categories[0]!.normalizedName = 'shared-category';
    state.categories[1]!.normalizedName = 'shared-category';
    expect(
      await resolve(
        create({ account: value('shared'), category: value('shared-category') }),
        state,
      ),
    ).toMatchObject({ kind: 'create', input: { accountId: 'cash', categoryId: 'food' } });
  });
  it('does not silently break equal-priority rule ties', async () => {
    const state = base();
    state.rules.push(
      rule('r1', 1, { targetBookId: 'pessoal' }),
      rule('r2', 1, { targetBookId: 'empresa' }),
    );
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'ambiguous',
    });
  });
  it('honors an explicit Book despite tied conflicting Book rules', async () => {
    const state = base();
    state.rules.push(
      rule('r1', 1, { targetBookId: 'pessoal' }),
      rule('r2', 1, { targetBookId: 'empresa' }),
    );
    expect(await resolve(create({ book: value('empresa') }), state)).toMatchObject({
      kind: 'create',
      input: { bookId: 'empresa', accountId: 'corporate' },
    });
    expect(await resolve(create({ book: value('unknown') }), state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'invalid',
    });
  });
  it('honors an explicit Account despite tied conflicting Account rules', async () => {
    const state = base();
    state.rules.push(
      rule('r1', 1, { targetAccountId: 'cash' }),
      rule('r2', 1, { targetAccountId: 'bank' }),
    );
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'account',
      reason: 'ambiguous',
    });
    expect(await resolve(create({ account: value('bank') }), state)).toMatchObject({
      kind: 'create',
      input: { accountId: 'bank' },
    });
  });
  it('honors an explicit Category despite tied conflicting Category rules', async () => {
    const state = base();
    state.categories.push(category('food', 'pessoal'), category('travel', 'pessoal'));
    state.rules.push(
      rule('r1', 1, { targetCategoryId: 'food' }),
      rule('r2', 1, { targetCategoryId: 'travel' }),
    );
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'category',
      reason: 'ambiguous',
    });
    expect(await resolve(create({ category: value('travel') }), state)).toMatchObject({
      kind: 'create',
      input: { categoryId: 'travel' },
    });
  });
  it('honors an explicit Merchant despite tied conflicting Merchant rules', async () => {
    const state = base();
    state.merchants.push(merchant('first'), merchant('second'));
    state.rules.push(
      rule('r1', 1, { targetMerchantId: 'first' }),
      rule('r2', 1, { targetMerchantId: 'second' }),
    );
    expect(await resolve(create(), state)).toEqual({
      kind: 'clarification',
      field: 'merchant',
      reason: 'ambiguous',
    });
    expect(await resolve(create({ merchant: value('second') }), state)).toMatchObject({
      kind: 'create',
      input: { merchantId: 'second' },
    });
  });
  it.each(['expense', 'income'] as const)(
    'accepts a both Category for %s explicitly and through a rule',
    async (transactionType) => {
      const state = base();
      state.categories.push(category('shared', 'pessoal', 'both'));
      expect(
        await resolve(
          create({ transactionType: value(transactionType), category: value('shared') }),
          state,
        ),
      ).toMatchObject({
        kind: 'create',
        input: { type: transactionType, categoryId: 'shared' },
      });
      state.rules.push(rule('r', 1, { targetCategoryId: 'shared' }));
      expect(
        await resolve(create({ transactionType: value(transactionType) }), state),
      ).toMatchObject({
        kind: 'create',
        input: { type: transactionType, categoryId: 'shared' },
      });
    },
  );
  it('rejects incompatible Category types and Books for explicit and rule targets', async () => {
    const state = base();
    state.categories.push(
      category('income-only', 'pessoal', 'income'),
      category('elsewhere', 'empresa', 'both'),
    );
    expect(await resolve(create({ category: value('income-only') }), state)).toEqual({
      kind: 'clarification',
      field: 'category',
      reason: 'invalid',
    });
    expect(await resolve(create({ category: value('elsewhere') }), state)).toEqual({
      kind: 'clarification',
      field: 'category',
      reason: 'invalid',
    });
    state.rules.push(rule('r', 1, { targetCategoryId: 'income-only' }));
    expect(await resolve(create(), state)).toMatchObject({
      kind: 'create',
      input: { categoryId: null },
    });
  });
  it('never assigns a both Category to a Transfer', async () => {
    const state = base();
    state.categories.push(category('shared', 'pessoal', 'both'));
    state.rules.push(rule('r', 1, { targetCategoryId: 'shared' }));
    const transfer = create({
      transactionType: value('transfer'),
      account: value('cash'),
      destinationAccount: value('bank'),
    });
    expect(await resolve(transfer, state)).toMatchObject({
      kind: 'create',
      input: { type: 'transfer', destinationAccountId: 'bank' },
    });
    expect(await resolve({ ...transfer, category: value('shared') }, state)).toEqual({
      kind: 'clarification',
      field: 'category',
      reason: 'invalid',
    });
  });
  it('skips a rule when any target is inactive or incompatible', async () => {
    const state = base();
    state.categories.push(category('inactive', 'empresa'));
    state.categories[0]!.active = false;
    state.rules.push(rule('unsafe', 1, { targetBookId: 'empresa', targetCategoryId: 'inactive' }));
    expect(await resolve(create(), state)).toMatchObject({
      kind: 'create',
      input: { bookId: 'pessoal', accountId: 'cash' },
    });
  });
  it('validates category type and active Merchant', async () => {
    const state = base();
    state.categories.push(category('salary', 'pessoal', 'income'));
    state.merchants.push(merchant('shop'));
    expect(await resolve(create({ category: value('salary') }), state)).toEqual({
      kind: 'clarification',
      field: 'category',
      reason: 'invalid',
    });
    expect(await resolve(create({ merchant: value('shop') }), state)).toMatchObject({
      kind: 'create',
      input: { merchantId: 'shop' },
    });
    state.merchants[0]!.active = false;
    expect(await resolve(create({ merchant: value('shop') }), state)).toEqual({
      kind: 'clarification',
      field: 'merchant',
      reason: 'invalid',
    });
  });
  it('asks for clarification when global Merchant aliases collide', async () => {
    const state = base();
    state.merchants.push(merchant('first'), merchant('second'));
    state.merchants[0]!.normalizedName = 'shared';
    state.merchants[1]!.normalizedName = 'shared';
    expect(await resolve(create({ merchant: value('shared') }), state)).toEqual({
      kind: 'clarification',
      field: 'merchant',
      reason: 'ambiguous',
    });
  });
  it('validates both Transfer Accounts and returns a complete Transfer input', async () => {
    const state = base();
    const transfer = create({
      transactionType: value('transfer'),
      account: value('cash'),
      destinationAccount: value('bank'),
      description: undefined,
    });
    expect(await resolve(transfer, state)).toMatchObject({
      kind: 'create',
      input: {
        type: 'transfer',
        accountId: 'cash',
        destinationAccountId: 'bank',
        description: 'cash para bank',
      },
    });
    expect(
      await resolve(
        create({
          transactionType: value('transfer'),
          account: value('cash'),
          destinationAccount: value('cash'),
          description: undefined,
        }),
        state,
      ),
    ).toEqual({ kind: 'clarification', field: 'destinationAccount', reason: 'invalid' });
  });
  it('resolves Last to Book ID only, respecting explicit context', async () => {
    const state = base();
    expect(await resolve({ kind: 'query_last', book: value('empresa') }, state)).toEqual({
      kind: 'query_last',
      bookId: 'empresa',
    });
    expect(await resolve({ kind: 'query_last' }, state)).toEqual({
      kind: 'query_last',
      bookId: 'pessoal',
    });
  });
  it('requires clarification for Last without a valid default or single Book', async () => {
    const state = base();
    state.sender = sender(null, null);
    expect(await resolve({ kind: 'query_last' }, state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'ambiguous',
    });
    state.books = [book('empresa')];
    expect(await resolve({ kind: 'query_last' }, state)).toEqual({
      kind: 'query_last',
      bookId: 'empresa',
    });
    state.books = [];
    expect(await resolve({ kind: 'query_last' }, state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'missing',
    });
  });
  it('offers a Book choice for Summary without a valid default', async () => {
    const state = base();
    state.sender = sender(null, null);
    expect(await resolve({ kind: 'query_summary' }, state)).toEqual({
      kind: 'clarification',
      field: 'book',
      reason: 'ambiguous',
    });
    state.books = [book('empresa')];
    expect(await resolve({ kind: 'query_summary' }, state)).toEqual({
      kind: 'query_summary',
      bookId: 'empresa',
    });
  });
  it('uses the Book-local received date and preserves explicit date provenance', async () => {
    expect(await resolve(create())).toMatchObject({
      kind: 'create',
      input: { transactionDate: '2026-10-26' },
      dateProvenance: 'received_local_date',
    });
    expect(
      await resolve(create({ date: value({ kind: 'relative', value: 'ontem' } as const) })),
    ).toMatchObject({
      kind: 'create',
      input: { transactionDate: '2026-10-25' },
      dateProvenance: 'explicit_input',
    });
    expect(
      await resolve(create({ date: value({ kind: 'pt_br', value: '25/10' } as const) })),
    ).toMatchObject({ kind: 'create', input: { transactionDate: '2026-10-25' } });
  });
  it('evaluates hoje, anteontem and full pt-BR dates in Book timezone', async () => {
    expect(
      await resolve(create({ date: value({ kind: 'relative', value: 'hoje' } as const) })),
    ).toMatchObject({ kind: 'create', input: { transactionDate: '2026-10-26' } });
    expect(
      await resolve(create({ date: value({ kind: 'relative', value: 'anteontem' } as const) })),
    ).toMatchObject({ kind: 'create', input: { transactionDate: '2026-10-24' } });
    expect(
      await resolve(create({ date: value({ kind: 'pt_br', value: '25/10/2025' } as const) })),
    ).toMatchObject({ kind: 'create', input: { transactionDate: '2025-10-25' } });
  });
  it('rejects future and invalid dates', async () => {
    expect(
      await resolve(create({ date: value({ kind: 'pt_br', value: '27/10/2026' } as const) })),
    ).toEqual({ kind: 'clarification', field: 'date', reason: 'future' });
    expect(
      await resolve(create({ date: value({ kind: 'pt_br', value: '31/02/2026' } as const) })),
    ).toEqual({ kind: 'clarification', field: 'date', reason: 'invalid' });
  });
});
