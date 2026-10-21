import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAuthorizedSender,
  updateAuthorizedSender,
  getAuthorizedSender,
  listAuthorizedSenders,
  archiveBook,
  archiveAccount,
} from '@finance-hub/core';
import { KyselyAuthorizedSenderRepository } from '@finance-hub/database';
import { t04Database } from './t04-fixtures.js';
const env = t04Database();
const now = () => new Date();
const input = () => ({ channel: 'custom-channel', senderReference: `  ${randomUUID()}  ` });

describe('Authorized Sender through canonical transaction port', () => {
  it('round trips unchanged identity, defaults and active-only lifecycle', async () => {
    const t = await env.targets();
    const identity = input();
    const sender = await env.run((ctx) =>
      createAuthorizedSender(
        { ...identity, defaultBookId: t.book.id, defaultAccountId: t.account.id },
        ctx,
        now(),
      ),
    );
    expect(sender).toMatchObject({ ...identity, active: true });
    expect(await env.run((ctx) => getAuthorizedSender(sender.id, ctx))).toEqual(sender);
    const updated = await env.run((ctx) =>
      updateAuthorizedSender({ id: sender.id, name: 'Renamed', active: false }, ctx, now()),
    );
    expect(updated).toMatchObject({
      ...identity,
      name: 'Renamed',
      active: false,
      defaultBookId: t.book.id,
      defaultAccountId: t.account.id,
    });
    expect(await env.run((ctx) => listAuthorizedSenders(ctx))).toContainEqual(updated);
    expect(await env.run((ctx) => ctx.senderDefaults.hasBookDefault(t.book.id))).toBe(true);
    expect(await env.run((ctx) => ctx.senderDefaults.hasAccountDefault(t.account.id))).toBe(true);
    await expect(env.run((ctx) => archiveBook(t.book.id, ctx, now()))).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR',
    });
    await expect(env.run((ctx) => archiveAccount(t.account.id, ctx, now()))).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR',
    });
    expect(
      await env.run((ctx) => updateAuthorizedSender({ id: sender.id, active: true }, ctx, now())),
    ).toMatchObject({ active: true });
  });
  it('accepts optional defaults and explicit inactive create', async () => {
    expect(
      await env.run((ctx) => createAuthorizedSender({ ...input(), active: false }, ctx, now())),
    ).toMatchObject({ active: false, defaultBookId: null, defaultAccountId: null });
  });
  it('rejects Account without Book, including merged PATCH clearing only Book', async () => {
    const t = await env.targets();
    await expect(
      env.run((ctx) =>
        createAuthorizedSender({ ...input(), defaultAccountId: t.account.id }, ctx, now()),
      ),
    ).rejects.toThrow('requires');
    const sender = await env.run((ctx) =>
      createAuthorizedSender(
        { ...input(), defaultBookId: t.book.id, defaultAccountId: t.account.id },
        ctx,
        now(),
      ),
    );
    await expect(
      env.run((ctx) => updateAuthorizedSender({ id: sender.id, defaultBookId: null }, ctx, now())),
    ).rejects.toThrow('requires');
    expect(await env.run((ctx) => getAuthorizedSender(sender.id, ctx))).toEqual(sender);
  });
  it('rejects cross-Book defaults on create and PATCH, including inactive Sender', async () => {
    const a = await env.targets();
    const b = await env.targets();
    await expect(
      env.run((ctx) =>
        createAuthorizedSender(
          { ...input(), active: false, defaultBookId: a.book.id, defaultAccountId: b.account.id },
          ctx,
          now(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'DEFAULT_ACCOUNT_BOOK_MISMATCH' });
    const sender = await env.run((ctx) =>
      createAuthorizedSender(
        { ...input(), defaultBookId: a.book.id, defaultAccountId: a.account.id },
        ctx,
        now(),
      ),
    );
    await expect(
      env.run((ctx) =>
        updateAuthorizedSender({ id: sender.id, defaultBookId: b.book.id }, ctx, now()),
      ),
    ).rejects.toMatchObject({ code: 'DEFAULT_ACCOUNT_BOOK_MISMATCH' });
  });
  for (const kind of ['book', 'account'] as const) {
    it(`rejects inactive ${kind} for inactive Sender create/update`, async () => {
      const t = await env.targets();
      const sender = await env.run((ctx) => createAuthorizedSender(input(), ctx, now()));
      await env.run((ctx) =>
        (kind === 'book' ? archiveBook : archiveAccount)(t[kind].id, ctx, now()),
      );
      const defaults = {
        defaultBookId: t.book.id,
        defaultAccountId: kind === 'account' ? t.account.id : null,
      };
      await expect(
        env.run((ctx) =>
          createAuthorizedSender({ ...input(), ...defaults, active: false }, ctx, now()),
        ),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
      await expect(
        env.run((ctx) =>
          updateAuthorizedSender({ id: sender.id, ...defaults, active: false }, ctx, now()),
        ),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_INACTIVE` });
    });
    it(`rejects missing ${kind}`, async () => {
      const t = await env.targets();
      await expect(
        env.run((ctx) =>
          createAuthorizedSender(
            {
              ...input(),
              defaultBookId: kind === 'book' ? randomUUID() : t.book.id,
              defaultAccountId: kind === 'account' ? randomUUID() : null,
            },
            ctx,
            now(),
          ),
        ),
      ).rejects.toMatchObject({ code: `${kind.toUpperCase()}_NOT_FOUND` });
    });
  }
  it('clears defaults explicitly, allowing both archives without deleting Sender', async () => {
    const t = await env.targets();
    const sender = await env.run((ctx) =>
      createAuthorizedSender(
        { ...input(), defaultBookId: t.book.id, defaultAccountId: t.account.id },
        ctx,
        now(),
      ),
    );
    const updated = await env.run((ctx) =>
      updateAuthorizedSender(
        { id: sender.id, defaultBookId: null, defaultAccountId: null, name: null },
        ctx,
        now(),
      ),
    );
    expect(updated).toMatchObject({ defaultBookId: null, defaultAccountId: null, name: null });
    expect(await env.run((ctx) => ctx.senderDefaults.hasBookDefault(t.book.id))).toBe(false);
    expect(await env.run((ctx) => ctx.senderDefaults.hasAccountDefault(t.account.id))).toBe(false);
    await env.run((ctx) => archiveAccount(t.account.id, ctx, now()));
    await env.run((ctx) => archiveBook(t.book.id, ctx, now()));
    expect(await env.run((ctx) => getAuthorizedSender(sender.id, ctx))).toEqual(updated);
  });
  it('PostgreSQL enforces identity uniqueness for concurrent Core creates', async () => {
    const identity = input();
    const results = await Promise.allSettled([
      env.run((ctx) => createAuthorizedSender(identity, ctx, now())),
      env.run((ctx) => createAuthorizedSender(identity, ctx, now())),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      (await env.run((ctx) => listAuthorizedSenders(ctx))).filter(
        (s) => s.senderReference === identity.senderReference,
      ),
    ).toHaveLength(1);
  });
  it('repository preserves FK/CHECK/default Book consistency enforcement', async () => {
    const t = await env.targets();
    const b = await env.targets();
    const template = await env.run((ctx) => createAuthorizedSender(input(), ctx, now()));
    const repo = new KyselyAuthorizedSenderRepository(env.db);
    await expect(
      repo.create({ ...template, id: randomUUID(), ...input(), defaultBookId: randomUUID() }),
    ).rejects.toThrow('reference constraint');
    await expect(
      repo.create({ ...template, id: randomUUID(), ...input(), defaultAccountId: t.account.id }),
    ).rejects.toThrow('check constraint');
    await expect(
      repo.create({
        ...template,
        id: randomUUID(),
        ...input(),
        defaultBookId: b.book.id,
        defaultAccountId: t.account.id,
      }),
    ).rejects.toThrow('reference constraint');
  });
});
