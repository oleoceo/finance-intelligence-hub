import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAuthorizedSender,
  updateAuthorizedSender,
  archiveBook,
  archiveAccount,
} from '@finance-hub/core';
import { t04Database, type Operation } from './t04-fixtures.js';
const env = t04Database();
const now = () => new Date();

describe(
  'Sender defaults versus archive on independent PostgreSQL connections',
  { timeout: 30000 },
  () => {
    for (const kind of ['book', 'account'] as const) {
      for (const updating of [false, true]) {
        it(`${kind}: ${updating ? 'update' : 'create'} assignment-first blocks archive, including inactive Sender`, async () => {
          const t = await env.targets();
          const input = { channel: 'custom-channel', senderReference: randomUUID(), active: false };
          const existing = updating
            ? await env.run((ctx) => createAuthorizedSender(input, ctx, now()))
            : null;
          const defaults = {
            defaultBookId: t.book.id,
            defaultAccountId: kind === 'account' ? t.account.id : null,
          };
          const assign: Operation = (ctx) =>
            existing
              ? updateAuthorizedSender({ id: existing.id, ...defaults }, ctx, now())
              : createAuthorizedSender({ ...input, ...defaults }, ctx, now());
          const archive: Operation = (ctx) =>
            (kind === 'book' ? archiveBook : archiveAccount)(t[kind].id, ctx, now());
          const results = await env.coordinated(assign, archive);
          expect(results[0].status).toBe('fulfilled');
          expect(results[1]).toMatchObject({
            status: 'rejected',
            reason: { code: 'DEPENDENCY_ERROR' },
          });
          const sender = await env.run((ctx) =>
            ctx.authorizedSenders.findByChannelAndReference(input.channel, input.senderReference),
          );
          expect(sender).toMatchObject({ ...defaults, active: false });
          expect(
            await env.run((ctx) =>
              (kind === 'book' ? ctx.books : ctx.accounts).findById(t[kind].id),
            ),
          ).toMatchObject({ active: true, archivedAt: null });
        });
        it(`${kind}: archive-first rejects ${updating ? 'update' : 'create'} assignment`, async () => {
          const t = await env.targets();
          const input = { channel: 'custom', senderReference: randomUUID() };
          const existing = updating
            ? await env.run((ctx) => createAuthorizedSender(input, ctx, now()))
            : null;
          const defaults = {
            defaultBookId: t.book.id,
            defaultAccountId: kind === 'account' ? t.account.id : null,
          };
          const assign: Operation = (ctx) =>
            existing
              ? updateAuthorizedSender({ id: existing.id, ...defaults }, ctx, now())
              : createAuthorizedSender({ ...input, ...defaults }, ctx, now());
          const archive: Operation = (ctx) =>
            (kind === 'book' ? archiveBook : archiveAccount)(t[kind].id, ctx, now());
          const results = await env.coordinated(archive, assign);
          expect(results[0].status).toBe('fulfilled');
          expect(results[1]).toMatchObject({
            status: 'rejected',
            reason: { code: `${kind.toUpperCase()}_INACTIVE` },
          });
          expect(
            await env.run((ctx) =>
              ctx.authorizedSenders.findByChannelAndReference(input.channel, input.senderReference),
            ),
          ).toEqual(existing);
          expect(
            await env.run((ctx) =>
              (kind === 'book' ? ctx.books : ctx.accounts).findById(t[kind].id),
            ),
          ).toMatchObject({ active: false });
        });
      }
      it(`${kind}: removal-first permits archive and retains inactive Sender`, async () => {
        const t = await env.targets();
        const sender = await env.run((ctx) =>
          createAuthorizedSender(
            {
              channel: 'custom',
              senderReference: randomUUID(),
              defaultBookId: t.book.id,
              defaultAccountId: t.account.id,
              active: false,
            },
            ctx,
            now(),
          ),
        );
        const results = await env.coordinated(
          (ctx) =>
            updateAuthorizedSender(
              { id: sender.id, defaultBookId: null, defaultAccountId: null },
              ctx,
              now(),
            ),
          (ctx) => (kind === 'book' ? archiveBook : archiveAccount)(t[kind].id, ctx, now()),
        );
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(await env.run((ctx) => ctx.authorizedSenders.findById(sender.id))).toMatchObject({
          defaultBookId: null,
          defaultAccountId: null,
          active: false,
        });
        expect(
          await env.run((ctx) => (kind === 'book' ? ctx.books : ctx.accounts).findById(t[kind].id)),
        ).toMatchObject({ active: false });
      });
    }
  },
);

it(
  'concurrent Sender PATCH retries changed defaults and merges locked state',
  { timeout: 30000 },
  async () => {
    const t = await env.targets();
    const sender = await env.run((ctx) =>
      createAuthorizedSender({ channel: 'custom', senderReference: randomUUID() }, ctx, now()),
    );
    let attempts = 0;
    const results = await env.coordinated(
      (ctx) =>
        updateAuthorizedSender(
          {
            id: sender.id,
            defaultBookId: t.book.id,
            defaultAccountId: t.account.id,
            name: 'Concurrent',
          },
          ctx,
          now(),
        ),
      (ctx) => {
        attempts++;
        return updateAuthorizedSender({ id: sender.id, active: false }, ctx, now());
      },
    );
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(attempts).toBe(2);
    expect(await env.run((ctx) => ctx.authorizedSenders.findById(sender.id))).toMatchObject({
      defaultBookId: t.book.id,
      defaultAccountId: t.account.id,
      name: 'Concurrent',
      active: false,
    });
  },
);
