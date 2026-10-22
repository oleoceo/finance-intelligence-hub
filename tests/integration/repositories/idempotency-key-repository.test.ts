import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import {
  KyselyFinancialTransactionPort,
  KyselyIdempotencyKeyRepository,
} from '@finance-hub/database';
import {
  ConcurrencyError,
  decideExistingIdempotency,
  IdempotencyInProgressRetryError,
  type IdempotencyKeyRepository,
} from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const scope = 'transactions:create' as const;
const now = new Date('2026-10-21T12:00:00Z');
const result = { data: { id: randomUUID(), amount: '35.00' } };

function claim(key: string, hash = 'a'.repeat(64)) {
  return { id: randomUUID(), scope, idempotencyKey: key, requestHash: hash, createdAt: now };
}

async function complete(repo: IdempotencyKeyRepository, id: string) {
  return repo.complete({
    id,
    resourceType: 'transaction',
    resourceId: result.data.id,
    responseStatus: 201,
    responseBody: result,
    completedAt: new Date('2026-10-21T12:00:01Z'),
  });
}

async function count(key: string) {
  const rows = await fixture.db
    .selectFrom('idempotency_keys')
    .select(['status'])
    .where('scope', '=', scope)
    .where('idempotency_key', '=', key)
    .execute();
  return rows;
}

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Idempotency race timed out')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

describe('M04-T06 PostgreSQL idempotency repository', () => {
  it('claims, completes, maps every field and replays logical result', async () => {
    const input = claim(randomUUID());
    const completed = await fixture.run(async (ctx) => {
      expect(ctx.idempotencyKeys).toBeInstanceOf(KyselyIdempotencyKeyRepository);
      const inserted = await ctx.idempotencyKeys.create(input);
      expect(inserted).toMatchObject({
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        scope,
        requestHash: input.requestHash,
        status: 'in_progress',
        resourceType: null,
        resourceId: null,
        responseStatus: null,
        responseBody: null,
        createdAt: now,
        completedAt: null,
      });
      return complete(ctx.idempotencyKeys, inserted!.id);
    });
    expect(completed).toMatchObject({
      status: 'completed',
      resourceType: 'transaction',
      resourceId: result.data.id,
      responseStatus: 201,
      responseBody: result,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    const replay = await fixture.run(async (ctx) => {
      expect(await ctx.idempotencyKeys.create({ ...input, id: randomUUID() })).toBeNull();
      const locked = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(input.idempotencyKey, scope);
      return decideExistingIdempotency(locked!, input.requestHash);
    });
    expect(replay).toMatchObject({ kind: 'replay', record: completed });
    expect(await count(input.idempotencyKey)).toEqual([{ status: 'completed' }]);
    const normalRead = await fixture.run((ctx) =>
      ctx.idempotencyKeys.findByKeyAndScope(input.idempotencyKey, scope),
    );
    expect(normalRead).toEqual(completed);
    await expect(
      fixture.run(async (ctx) => {
        expect(await ctx.idempotencyKeys.create({ ...input, id: randomUUID() })).toBeNull();
        const locked = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(input.idempotencyKey, scope);
        return decideExistingIdempotency(locked!, 'b'.repeat(64));
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rolls a claim back with the outer financial transaction', async () => {
    const input = claim(randomUUID());
    await expect(
      fixture.run(async (ctx) => {
        expect(await ctx.idempotencyKeys.create(input)).not.toBeNull();
        throw new Error('pre-commit failure');
      }),
    ).rejects.toThrow('pre-commit failure');
    expect(await count(input.idempotencyKey)).toEqual([]);
  });

  it('restarts the whole transaction for a locked same-hash in_progress row', async () => {
    const input = claim(randomUUID());
    let attempts = 0;
    await expect(
      fixture.run(async (ctx) => {
        attempts++;
        expect(await ctx.idempotencyKeys.create(input)).not.toBeNull();
        const locked = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(input.idempotencyKey, scope);
        expect(decideExistingIdempotency(locked!, input.requestHash)).toEqual({ kind: 'retry' });
        throw new IdempotencyInProgressRetryError();
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect(attempts).toBe(3);
    expect(await count(input.idempotencyKey)).toEqual([]);
  });

  it('has no expiry column or automatic cleanup routine', async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'idempotency_keys' and column_name = 'expires_at'
    `.execute(fixture.db);
    expect(columns.rows).toEqual([]);
    const routines = await sql<{ proname: string }>`
      select proname from pg_proc where proname ilike '%idempotency%expir%'
    `.execute(fixture.db);
    expect(routines.rows).toEqual([]);
  });

  it.each([
    ['same hash', 'a'.repeat(64), false],
    ['different hash', 'b'.repeat(64), false],
    ['winner rollback', 'a'.repeat(64), true],
  ] as const)('serializes concurrent %s on independent backends', async (_, contenderHash, rollback) => {
    const input = claim(randomUUID());
    const firstPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const secondPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    const held = barrier();
    const release = barrier();
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      first = new KyselyFinancialTransactionPort(firstDb).runInTransaction(async (ctx) => {
        const owned = await ctx.idempotencyKeys.create(input);
        expect(owned).not.toBeNull();
        held.release();
        await bounded(release.promise);
        if (rollback) throw new Error('winner aborted');
        return complete(ctx.idempotencyKeys, owned!.id);
      });
      await bounded(held.promise);
      second = new KyselyFinancialTransactionPort(secondDb).runInTransaction(async (ctx) => {
        const owned = await ctx.idempotencyKeys.create({ ...input, id: randomUUID(), requestHash: contenderHash });
        if (owned) return { kind: 'owner', record: await complete(ctx.idempotencyKeys, owned.id) };
        const existing = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(input.idempotencyKey, scope);
        if (!existing) throw new IdempotencyInProgressRetryError();
        const decision = decideExistingIdempotency(existing, contenderHash);
        if (decision.kind === 'retry') throw new IdempotencyInProgressRetryError();
        return decision;
      });
      await bounded(
        (async () => {
          for (;;) {
            const observed = await fixture.pool.query(
              'select pg_blocking_pids($1) blockers, wait_event_type from pg_stat_activity where pid=$1',
              [pid2],
            );
            if (
              observed.rows[0]?.blockers.includes(pid1) &&
              observed.rows[0]?.wait_event_type === 'Lock'
            )
              break;
          }
        })(),
      );
      release.release();
      const [winner, contender] = await bounded(Promise.allSettled([first, second]));
      if (rollback) {
        expect(winner).toMatchObject({ status: 'rejected', reason: new Error('winner aborted') });
        expect(contender).toMatchObject({ status: 'fulfilled', value: { kind: 'owner' } });
      } else if (contenderHash !== input.requestHash) {
        expect(winner.status).toBe('fulfilled');
        expect(contender).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
        });
      } else {
        expect(winner.status).toBe('fulfilled');
        expect(contender).toMatchObject({
          status: 'fulfilled',
          value: { kind: 'replay', record: (winner as PromiseFulfilledResult<unknown>).value },
        });
      }
      expect(await count(input.idempotencyKey)).toEqual([{ status: 'completed' }]);
    } finally {
      release.release();
      await Promise.allSettled([first, second].filter((p): p is Promise<unknown> => !!p));
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });
});
