import { describe, it, expect, vi } from 'vitest';
import {
  createClassificationRule,
  updateClassificationRule,
} from './classification-rule-use-cases.js';
import { createAuthorizedSender, updateAuthorizedSender } from './authorized-sender-use-cases.js';
import {
  ConfigurationLockSetChangedError,
  type MasterDataTransactionContextT04,
  type BookRecord,
  type AccountRecord,
  type CategoryRecord,
  type MerchantRecord,
} from '../ports/master-data-ports.js';
import type { ClassificationRuleRecord } from '../../domain/master-data/classification-rule.js';
import type { AuthorizedSenderRecord } from '../../domain/master-data/authorized-sender.js';
const now = new Date('2026-10-20T00:00:00Z');
const base = { priority: 10, matchType: 'contains', pattern: '  Google ADS  ' };
function fixture() {
  const book: BookRecord = {
    id: 'book-a',
    name: 'A',
    normalizedName: 'a',
    currency: 'BRL',
    timezone: 'UTC',
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const account: AccountRecord = {
    ...book,
    id: 'account-a',
    bookId: book.id,
    type: 'checking',
    institutionName: null,
    notes: null,
  };
  const category: CategoryRecord = {
    ...book,
    id: 'category-a',
    bookId: book.id,
    type: 'both',
    parentCategoryId: null,
  };
  const merchant: MerchantRecord = { ...book, id: 'merchant-a', type: null, taxIdentifier: null };
  const books = new Map([
    [book.id, book],
    ['book-b', { ...book, id: 'book-b' }],
  ]);
  const accounts = new Map([[account.id, account]]);
  const categories = new Map([[category.id, category]]);
  const merchants = new Map([[merchant.id, merchant]]);
  const rules = new Map<string, ClassificationRuleRecord>();
  const senders = new Map<string, AuthorizedSenderRecord>();
  const common = { find: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() };
  const ctx: MasterDataTransactionContextT04 = {
    books: { ...common, findById: vi.fn(async (id) => books.get(id) ?? null), findByName: vi.fn() },
    accounts: {
      ...common,
      findById: vi.fn(async (id) => accounts.get(id) ?? null),
      findByBookId: vi.fn(),
    },
    categories: {
      ...common,
      findById: vi.fn(async (id) => categories.get(id) ?? null),
      findByBookId: vi.fn(),
      findByIds: vi.fn(),
    },
    merchants: {
      ...common,
      findById: vi.fn(async (id) => merchants.get(id) ?? null),
      findByNormalizedName: vi.fn(),
      findByIds: vi.fn(),
    },
    classificationRules: {
      findById: vi.fn(async (id) => (rules.has(id) ? { ...rules.get(id)! } : null)),
      find: vi.fn(async () => [...rules.values()]),
      create: vi.fn(async (rule) => {
        rules.set(rule.id, rule);
      }),
      update: vi.fn(async (patch) => {
        const rule = { ...rules.get(patch.id)!, ...patch } as ClassificationRuleRecord;
        rules.set(rule.id, rule);
        return rule;
      }),
    },
    authorizedSenders: {
      findById: vi.fn(async (id) => (senders.has(id) ? { ...senders.get(id)! } : null)),
      find: vi.fn(async () => [...senders.values()]),
      findByChannelAndReference: vi.fn(),
      create: vi.fn(async (sender) => {
        senders.set(sender.id, sender);
      }),
      update: vi.fn(async (patch) => {
        const sender = { ...senders.get(patch.id)!, ...patch };
        senders.set(sender.id, sender);
        return sender;
      }),
    },
    locks: { acquireLocks: vi.fn(async () => {}) },
    financialUsage: { hasBookUsage: vi.fn(), hasAccountUsage: vi.fn() },
    senderDefaults: { hasBookDefault: vi.fn(), hasAccountDefault: vi.fn() },
  };
  return {
    ctx,
    book,
    account,
    category,
    merchant,
    books,
    accounts,
    categories,
    merchants,
    rules,
    senders,
  };
}

describe('T04 Rule application invariants', () => {
  for (const kind of ['book', 'account', 'category', 'merchant'] as const) {
    const field = `target${kind[0].toUpperCase()}${kind.slice(1)}Id`;
    it(`allows ${kind}-only targets and preserves raw pattern/manual source`, async () => {
      const f = fixture();
      expect(
        await createClassificationRule({ ...base, [field]: f[kind].id }, f.ctx, now),
      ).toMatchObject({
        pattern: base.pattern,
        normalizedPattern: 'google ads',
        source: 'manual',
        active: true,
        [field]: f[kind].id,
      });
    });
    it(`rejects missing ${kind}`, async () => {
      await expect(
        createClassificationRule({ ...base, [field]: 'missing' }, fixture().ctx, now),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_NOT_FOUND` });
    });
    it(`checks ${kind} active state after locks, including unchanged inactive target on deactivation`, async () => {
      const f = fixture();
      const rule = await createClassificationRule({ ...base, [field]: f[kind].id }, f.ctx, now);
      vi.mocked(f.ctx.locks.acquireLocks).mockImplementation(async () => {
        f[kind].active = false;
      });
      await expect(
        updateClassificationRule({ id: rule.id, active: false }, f.ctx, now),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
      expect(f.ctx.classificationRules.update).not.toHaveBeenCalled();
    });
  }
  for (const kind of ['account', 'category'] as const) {
    it(`validates derived Book active state for ${kind}-only rule`, async () => {
      const f = fixture();
      f.book.active = false;
      await expect(
        createClassificationRule(
          { ...base, [`target${kind === 'account' ? 'Account' : 'Category'}Id`]: f[kind].id },
          f.ctx,
          now,
        ),
      ).rejects.toMatchObject({ code: 'BOOK_INACTIVE' });
    });
  }
  for (const conflict of ['book-account', 'book-category', 'account-category']) {
    it(`rejects ${conflict} context mismatch on create and effective PATCH`, async () => {
      const f = fixture();
      f.category.bookId = 'book-b';
      const targets =
        conflict === 'book-account'
          ? { targetBookId: 'book-b', targetAccountId: f.account.id }
          : conflict === 'book-category'
            ? { targetBookId: f.book.id, targetCategoryId: f.category.id }
            : { targetAccountId: f.account.id, targetCategoryId: f.category.id };
      await expect(
        createClassificationRule({ ...base, ...targets }, f.ctx, now),
      ).rejects.toMatchObject({ code: 'RULE_TARGET_CONTEXT_MISMATCH' });
      const rule = await createClassificationRule(
        { ...base, targetMerchantId: f.merchant.id },
        f.ctx,
        now,
      );
      await expect(
        updateClassificationRule({ id: rule.id, ...targets, active: false }, f.ctx, now),
      ).rejects.toMatchObject({ code: 'RULE_TARGET_CONTEXT_MISMATCH' });
    });
  }
  it('locks all entity kinds and Rule row before re-reading and merging PATCH', async () => {
    const f = fixture();
    const rule = await createClassificationRule(
      {
        ...base,
        targetBookId: f.book.id,
        targetAccountId: f.account.id,
        targetCategoryId: f.category.id,
        targetMerchantId: f.merchant.id,
      },
      f.ctx,
      now,
    );
    vi.mocked(f.ctx.locks.acquireLocks)
      .mockClear()
      .mockImplementation(async (spec) => {
        expect(spec).toEqual({
          books: [f.book.id],
          accounts: [f.account.id],
          categories: [f.category.id],
          merchants: [f.merchant.id],
          classificationRules: [rule.id],
        });
        f.rules.set(rule.id, {
          ...rule,
          priority: 42,
          pattern: 'concurrent',
          normalizedPattern: 'concurrent',
        });
      });
    expect(
      await updateClassificationRule({ id: rule.id, active: false }, f.ctx, now),
    ).toMatchObject({ priority: 42, pattern: 'concurrent', active: false });
    expect(f.ctx.locks.acquireLocks).toHaveBeenCalledTimes(1);
  });
  it('restarts when locked Rule reveals an undiscovered reference instead of taking late locks', async () => {
    const f = fixture();
    const rule = await createClassificationRule({ ...base, targetBookId: f.book.id }, f.ctx, now);
    vi.mocked(f.ctx.locks.acquireLocks)
      .mockClear()
      .mockImplementation(async () => {
        f.rules.set(rule.id, { ...rule, targetBookId: 'book-b' });
      });
    await expect(
      updateClassificationRule(
        { id: rule.id, targetBookId: null, targetMerchantId: f.merchant.id },
        f.ctx,
        now,
      ),
    ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
    expect(f.ctx.locks.acquireLocks).toHaveBeenCalledTimes(1);
    expect(f.ctx.classificationRules.update).not.toHaveBeenCalled();
  });
  it('restarts when target ownership changes during lock discovery', async () => {
    const f = fixture();
    vi.mocked(f.ctx.locks.acquireLocks).mockImplementation(async () => {
      f.account.bookId = 'book-b';
    });
    await expect(
      createClassificationRule({ ...base, targetAccountId: f.account.id }, f.ctx, now),
    ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
    expect(f.ctx.classificationRules.create).not.toHaveBeenCalled();
  });
  it('rejects removing the last target and permits replacing an inactive target', async () => {
    const f = fixture();
    const rule = await createClassificationRule({ ...base, targetBookId: f.book.id }, f.ctx, now);
    await expect(
      updateClassificationRule({ id: rule.id, targetBookId: null }, f.ctx, now),
    ).rejects.toThrow('at least one target');
    f.book.active = false;
    expect(
      await updateClassificationRule(
        { id: rule.id, targetBookId: null, targetMerchantId: f.merchant.id },
        f.ctx,
        now,
      ),
    ).toMatchObject({ targetBookId: null, targetMerchantId: f.merchant.id });
  });
});

describe('T04 Sender application invariants', () => {
  const identity = { channel: 'custom', senderReference: '  unchanged  ' };
  it('preserves sender reference and explicit inactive create with defaults', async () => {
    const f = fixture();
    expect(
      await createAuthorizedSender(
        { ...identity, active: false, defaultBookId: f.book.id, defaultAccountId: f.account.id },
        f.ctx,
        now,
      ),
    ).toMatchObject({
      ...identity,
      active: false,
      defaultBookId: f.book.id,
      defaultAccountId: f.account.id,
    });
  });
  it('enforces stored reference length without trimming it', async () => {
    await expect(
      createAuthorizedSender(
        { ...identity, senderReference: ' ' + 'a'.repeat(255) },
        fixture().ctx,
        now,
      ),
    ).rejects.toThrow('255');
  });
  it('rejects Account without Book and cross-Book defaults', async () => {
    const f = fixture();
    await expect(
      createAuthorizedSender({ ...identity, defaultAccountId: f.account.id }, f.ctx, now),
    ).rejects.toThrow('requires');
    await expect(
      createAuthorizedSender(
        { ...identity, defaultBookId: 'book-b', defaultAccountId: f.account.id },
        f.ctx,
        now,
      ),
    ).rejects.toMatchObject({ code: 'DEFAULT_ACCOUNT_BOOK_MISMATCH' });
  });
  for (const kind of ['book', 'account'] as const) {
    it(`rejects missing default ${kind}`, async () => {
      const f = fixture();
      await expect(
        createAuthorizedSender(
          {
            ...identity,
            defaultBookId: kind === 'book' ? 'missing' : f.book.id,
            defaultAccountId: kind === 'account' ? 'missing' : null,
          },
          f.ctx,
          now,
        ),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_NOT_FOUND` });
    });
    it(`validates ${kind} active state after all create locks`, async () => {
      const f = fixture();
      vi.mocked(f.ctx.locks.acquireLocks).mockImplementation(async (spec) => {
        expect(spec).toEqual({ books: [f.book.id], accounts: [f.account.id] });
        f[kind].active = false;
      });
      await expect(
        createAuthorizedSender(
          { ...identity, active: false, defaultBookId: f.book.id, defaultAccountId: f.account.id },
          f.ctx,
          now,
        ),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
      expect(f.ctx.authorizedSenders.create).not.toHaveBeenCalled();
    });
    it(`validates unchanged inactive ${kind} on Sender deactivation PATCH`, async () => {
      const f = fixture();
      const sender = await createAuthorizedSender(
        { ...identity, defaultBookId: f.book.id, defaultAccountId: f.account.id },
        f.ctx,
        now,
      );
      f[kind].active = false;
      await expect(
        updateAuthorizedSender({ id: sender.id, active: false }, f.ctx, now),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
    });
  }
  it('merges from locked Sender and retains defaults on deactivation', async () => {
    const f = fixture();
    const sender = await createAuthorizedSender(
      { ...identity, defaultBookId: f.book.id, defaultAccountId: f.account.id },
      f.ctx,
      now,
    );
    vi.mocked(f.ctx.locks.acquireLocks)
      .mockClear()
      .mockImplementation(async (spec) => {
        expect(spec).toEqual({
          books: [f.book.id],
          accounts: [f.account.id],
          authorizedSenders: [sender.id],
        });
        f.senders.set(sender.id, { ...sender, name: 'Concurrent' });
      });
    expect(
      await updateAuthorizedSender({ id: sender.id, active: false }, f.ctx, now),
    ).toMatchObject({
      name: 'Concurrent',
      active: false,
      defaultBookId: f.book.id,
      defaultAccountId: f.account.id,
    });
    expect(f.ctx.locks.acquireLocks).toHaveBeenCalledTimes(1);
  });
  it('rolls back for rediscovery when old defaults changed, even when PATCH clears them', async () => {
    const f = fixture();
    const sender = await createAuthorizedSender(identity, f.ctx, now);
    vi.mocked(f.ctx.locks.acquireLocks)
      .mockClear()
      .mockImplementation(async () => {
        f.senders.set(sender.id, { ...sender, defaultBookId: f.book.id });
      });
    await expect(
      updateAuthorizedSender({ id: sender.id, defaultBookId: null }, f.ctx, now),
    ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
    expect(f.ctx.authorizedSenders.update).not.toHaveBeenCalled();
    expect(f.ctx.locks.acquireLocks).toHaveBeenCalledTimes(1);
  });
  it('locks old/new Books in ascending order before removal and preserves explicit nulls', async () => {
    const f = fixture();
    const sender = await createAuthorizedSender(
      { ...identity, defaultBookId: 'book-b', defaultAccountId: null },
      f.ctx,
      now,
    );
    vi.mocked(f.ctx.locks.acquireLocks).mockClear();
    expect(
      await updateAuthorizedSender(
        { id: sender.id, defaultBookId: f.book.id, defaultAccountId: f.account.id, name: null },
        f.ctx,
        now,
      ),
    ).toMatchObject({ defaultBookId: f.book.id, defaultAccountId: f.account.id, name: null });
    expect(f.ctx.locks.acquireLocks).toHaveBeenCalledWith({
      books: ['book-a', 'book-b'],
      accounts: [f.account.id],
      authorizedSenders: [sender.id],
    });
    await expect(
      updateAuthorizedSender({ id: sender.id, defaultBookId: null }, f.ctx, now),
    ).rejects.toThrow('requires');
    expect(
      await updateAuthorizedSender(
        { id: sender.id, defaultBookId: null, defaultAccountId: null },
        f.ctx,
        now,
      ),
    ).toMatchObject({ defaultBookId: null, defaultAccountId: null });
  });
});
