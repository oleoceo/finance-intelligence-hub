import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createClassificationRule,
  updateClassificationRule,
  getClassificationRule,
  listClassificationRules,
  archiveBook,
  archiveAccount,
  archiveCategory,
  archiveMerchant,
  ConfigurationLockSetChangedError,
} from '@finance-hub/core';
import { KyselyClassificationRuleRepository } from '@finance-hub/database';
import { t04Database } from './t04-fixtures.js';
const env = t04Database();
const now = () => new Date();
const base = { priority: 10, matchType: 'contains', pattern: '  Google ADS  ' };

describe('Rule configuration through canonical transaction port', () => {
  it('round trips raw/normalized pattern, manual source, activation, get and list', async () => {
    const t = await env.targets();
    const rule = await env.run((ctx) =>
      createClassificationRule(
        {
          ...base,
          targetBookId: t.book.id,
          targetAccountId: t.account.id,
          targetCategoryId: t.category.id,
          targetMerchantId: t.merchant.id,
        },
        ctx,
        now(),
      ),
    );
    expect(rule).toMatchObject({
      pattern: base.pattern,
      normalizedPattern: 'google ads',
      source: 'manual',
      active: true,
    });
    expect(await env.run((ctx) => getClassificationRule(rule.id, ctx))).toEqual(rule);
    const updated = await env.run((ctx) =>
      updateClassificationRule(
        { id: rule.id, active: false, pattern: '  NEW  ', priority: 3, matchType: 'exact' },
        ctx,
        now(),
      ),
    );
    expect(updated).toMatchObject({
      active: false,
      pattern: '  NEW  ',
      normalizedPattern: 'new',
      source: 'manual',
      priority: 3,
      matchType: 'exact',
    });
    expect(await env.run((ctx) => listClassificationRules(ctx))).toContainEqual(updated);
    expect(
      await env.run((ctx) => updateClassificationRule({ id: rule.id, active: true }, ctx, now())),
    ).toMatchObject({ active: true });
  });
  for (const kind of ['book', 'account', 'category', 'merchant'] as const) {
    const field = `target${kind[0].toUpperCase()}${kind.slice(1)}Id`;
    it(`accepts ${kind}-only configuration without fabricated explicit Book requirement`, async () => {
      const t = await env.targets();
      expect(
        await env.run((ctx) =>
          createClassificationRule({ ...base, [field]: t[kind].id }, ctx, now()),
        ),
      ).toMatchObject({ [field]: t[kind].id });
    });
    it(`rejects missing ${kind} through Core`, async () => {
      await expect(
        env.run((ctx) => createClassificationRule({ ...base, [field]: randomUUID() }, ctx, now())),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_NOT_FOUND` });
    });
    it(`rejects inactive ${kind} through Core`, async () => {
      const t = await env.targets();
      await env.run((ctx) =>
        ({
          book: archiveBook,
          account: archiveAccount,
          category: archiveCategory,
          merchant: archiveMerchant,
        })[kind](t[kind].id, ctx, now()),
      );
      await expect(
        env.run((ctx) => createClassificationRule({ ...base, [field]: t[kind].id }, ctx, now())),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
    });
  }
  for (const conflict of ['book-account', 'book-category', 'account-category']) {
    it(`rejects ${conflict} Book mismatch on create and merged PATCH`, async () => {
      const a = await env.targets();
      const b = await env.targets();
      const targets =
        conflict === 'book-account'
          ? { targetBookId: a.book.id, targetAccountId: b.account.id }
          : conflict === 'book-category'
            ? { targetBookId: a.book.id, targetCategoryId: b.category.id }
            : { targetAccountId: a.account.id, targetCategoryId: b.category.id };
      await expect(
        env.run((ctx) => createClassificationRule({ ...base, ...targets }, ctx, now())),
      ).rejects.toMatchObject({ code: 'RULE_TARGET_CONTEXT_MISMATCH' });
      const rule = await env.run((ctx) =>
        createClassificationRule({ ...base, targetMerchantId: a.merchant.id }, ctx, now()),
      );
      await expect(
        env.run((ctx) =>
          updateClassificationRule({ id: rule.id, ...targets, active: false }, ctx, now()),
        ),
      ).rejects.toMatchObject({ code: 'RULE_TARGET_CONTEXT_MISMATCH' });
      expect(await env.run((ctx) => getClassificationRule(rule.id, ctx))).toEqual(rule);
    });
  }
  for (const kind of ['account', 'category'] as const) {
    it(`rejects ${kind}-only when derived owning Book is inactive`, async () => {
      const t = await env.targets();
      await env.run((ctx) => archiveBook(t.book.id, ctx, now()));
      await expect(
        env.run((ctx) =>
          createClassificationRule(
            { ...base, [`target${kind === 'account' ? 'Account' : 'Category'}Id`]: t[kind].id },
            ctx,
            now(),
          ),
        ),
      ).rejects.toMatchObject({ code: 'BOOK_INACTIVE' });
    });
  }
  it('enforces at-least-one target on create and PATCH', async () => {
    await expect(env.run((ctx) => createClassificationRule(base, ctx, now()))).rejects.toThrow(
      'at least one target',
    );
    const t = await env.targets();
    const rule = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id }, ctx, now()),
    );
    await expect(
      env.run((ctx) => updateClassificationRule({ id: rule.id, targetBookId: null }, ctx, now())),
    ).rejects.toThrow('at least one target');
  });
  it('repository preserves deterministic priority/created_at/id ordering including ties', async () => {
    const t = await env.targets();
    const time = now();
    const template = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id }, ctx, time),
    );
    const repo = new KyselyClassificationRuleRepository(env.db);
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const id of [...ids].reverse())
      await repo.create({ ...template, id, priority: -100, createdAt: time });
    const rows = (await repo.find()).filter((r) => ids.includes(r.id));
    expect(rows.map((r) => r.id)).toEqual(ids);
  });
  it('Core accepts negative priority and PostgreSQL ordering includes negative values correctly', async () => {
    const t = await env.targets();
    const time = now();
    const ruleNeg = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id, priority: -50 }, ctx, time),
    );
    const ruleZero = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id, priority: 0 }, ctx, time),
    );
    const rulePos = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id, priority: 100 }, ctx, time),
    );
    const all = await env.run((ctx) => listClassificationRules(ctx));
    const relevant = all.filter((r) => [ruleNeg.id, ruleZero.id, rulePos.id].includes(r.id));
    expect(relevant.map((r) => r.priority)).toEqual([-50, 0, 100]);
  });
  it('repository retains PostgreSQL target FK and CHECK enforcement', async () => {
    const t = await env.targets();
    const repo = new KyselyClassificationRuleRepository(env.db);
    const template = await env.run((ctx) =>
      createClassificationRule({ ...base, targetBookId: t.book.id }, ctx, now()),
    );
    await expect(
      repo.create({ ...template, id: randomUUID(), targetBookId: randomUUID() }),
    ).rejects.toThrow('reference constraint');
    await expect(
      repo.create({ ...template, id: randomUUID(), targetBookId: null }),
    ).rejects.toThrow('check constraint');
    await expect(
      repo.create({ ...template, id: randomUUID(), matchType: 'invalid' as 'exact' }),
    ).rejects.toThrow('check constraint');
  });
  it('transaction rediscovery rolls back intermediate writes and retries on a fresh context', async () => {
    const t = await env.targets();
    let attempts = 0;
    const written: string[] = [];
    const result = await env.run(async (ctx) => {
      attempts++;
      const rule = await createClassificationRule({ ...base, targetBookId: t.book.id }, ctx, now());
      written.push(rule.id);
      if (attempts < 3) throw new ConfigurationLockSetChangedError();
      return rule;
    });
    expect(attempts).toBe(3);
    expect(await env.run((ctx) => getClassificationRule(written[0], ctx))).toBeNull();
    expect(await env.run((ctx) => getClassificationRule(written[1], ctx))).toBeNull();
    expect(await env.run((ctx) => getClassificationRule(result.id, ctx))).toEqual(result);
  });
  it('bounds rediscovery retry exhaustion at three transactions', async () => {
    let attempts = 0;
    await expect(
      env.run(async () => {
        attempts++;
        throw new ConfigurationLockSetChangedError();
      }),
    ).rejects.toMatchObject({ code: 'CONCURRENCY_ERROR' });
    expect(attempts).toBe(3);
  });
});
