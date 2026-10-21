import { describe, it, expect } from 'vitest';
import {
  createClassificationRule,
  updateClassificationRule,
  archiveBook,
  archiveAccount,
  archiveCategory,
  archiveMerchant,
} from '@finance-hub/core';
import { t04Database, type Operation } from './t04-fixtures.js';
const env = t04Database();
const now = () => new Date();
const base = { priority: 10, matchType: 'contains', pattern: '  Raw Pattern  ' };

describe(
  'Rule configuration versus archive on independent PostgreSQL connections',
  { timeout: 30000 },
  () => {
    for (const kind of ['book', 'account', 'category', 'merchant'] as const) {
      for (const updating of [false, true]) {
        it(`${kind}: configuration-first (${updating ? 'update' : 'create'}) preserves reference after archive`, async () => {
          const t = await env.targets();
          const target = { [`target${kind[0].toUpperCase()}${kind.slice(1)}Id`]: t[kind].id };
          const existing = updating
            ? await env.run((ctx) => createClassificationRule({ ...base, ...target }, ctx, now()))
            : null;
          const configure: Operation = (ctx) =>
            existing
              ? updateClassificationRule({ id: existing.id, priority: 11 }, ctx, now())
              : createClassificationRule({ ...base, ...target }, ctx, now());
          const archive: Operation = (ctx) =>
            ({
              book: archiveBook,
              account: archiveAccount,
              category: archiveCategory,
              merchant: archiveMerchant,
            })[kind](t[kind].id, ctx, now());
          const results = await env.coordinated(configure, archive);
          expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
          const rules = await env.run((ctx) => ctx.classificationRules.find());
          const rule = rules.find(
            (r) => r.id === (results[0] as PromiseFulfilledResult<{ id: string }>).value.id,
          )!;
          expect(rule).toMatchObject({ ...target, active: true, source: 'manual' });
          const archived = await env.run((ctx) =>
            ({
              book: ctx.books,
              account: ctx.accounts,
              category: ctx.categories,
              merchant: ctx.merchants,
            })[kind].findById(t[kind].id),
          );
          expect(archived).toMatchObject({ active: false });
          await expect(
            env.run((ctx) => updateClassificationRule({ id: rule.id, active: false }, ctx, now())),
          ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
          const replacement = await env.targets();
          const repaired = await env.run((ctx) =>
            updateClassificationRule(
              {
                id: rule.id,
                ...{ [`target${kind[0].toUpperCase()}${kind.slice(1)}Id`]: null },
                targetMerchantId: replacement.merchant.id,
              },
              ctx,
              now(),
            ),
          );
          expect(repaired.targetMerchantId).toBe(replacement.merchant.id);
        });
        it(`${kind}: archive-first rejects ${updating ? 'update' : 'create'} without rewriting Rule`, async () => {
          const t = await env.targets();
          const target = { [`target${kind[0].toUpperCase()}${kind.slice(1)}Id`]: t[kind].id };
          const existing = updating
            ? await env.run((ctx) => createClassificationRule({ ...base, ...target }, ctx, now()))
            : null;
          const archive: Operation = (ctx) =>
            ({
              book: archiveBook,
              account: archiveAccount,
              category: archiveCategory,
              merchant: archiveMerchant,
            })[kind](t[kind].id, ctx, now());
          const configure: Operation = (ctx) =>
            existing
              ? updateClassificationRule({ id: existing.id, priority: 22 }, ctx, now())
              : createClassificationRule({ ...base, ...target }, ctx, now());
          const count = (await env.run((ctx) => ctx.classificationRules.find())).length;
          const results = await env.coordinated(archive, configure);
          expect(results[0].status).toBe('fulfilled');
          expect(results[1]).toMatchObject({
            status: 'rejected',
            reason: { code: `${kind.toUpperCase()}_INACTIVE` },
          });
          expect((await env.run((ctx) => ctx.classificationRules.find())).length).toBe(count);
          if (existing)
            expect(await env.run((ctx) => ctx.classificationRules.findById(existing.id))).toEqual(
              existing,
            );
        });
      }
    }
  },
);

it(
  'concurrent Rule PATCH retries changed references and preserves committed fields',
  { timeout: 30000 },
  async () => {
    const a = await env.targets();
    const b = await env.targets();
    const rule = await env.run((ctx) =>
      createClassificationRule({ ...base, targetMerchantId: a.merchant.id }, ctx, now()),
    );
    let attempts = 0;
    const results = await env.coordinated(
      (ctx) =>
        updateClassificationRule(
          { id: rule.id, targetMerchantId: b.merchant.id, priority: 77 },
          ctx,
          now(),
        ),
      (ctx) => {
        attempts++;
        return updateClassificationRule({ id: rule.id, active: false }, ctx, now());
      },
    );
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(attempts).toBe(2);
    expect(await env.run((ctx) => ctx.classificationRules.findById(rule.id))).toMatchObject({
      targetMerchantId: b.merchant.id,
      priority: 77,
      active: false,
    });
  },
);
