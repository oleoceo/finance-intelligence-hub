import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildApp } from '../../../../apps/api/src/index.js';
import { interpretMessage } from '../../../../packages/core/src/application/inbox/interpret-message.js';
import { t02Database } from '../../../../tests/integration/repositories/t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-28T12:00:00Z');
const sender = '5511998877665';
const ids = {
  book: randomUUID(),
  account: randomUUID(),
  inter: randomUUID(),
  sender: randomUUID(),
  personalBook: randomUUID(),
  personalAccount: randomUUID(),
  accountChoiceSender: randomUUID(),
  bookChoiceSender: randomUUID(),
  emptySender: randomUUID(),
};
const accountChoicePhone = '5511998877666';
const bookChoicePhone = '5511998877667';
const emptyPhone = '5511998877668';
let app: ReturnType<typeof buildApp>;
const workflow = JSON.parse(readFileSync(new URL('../p03/workflow.json', import.meta.url), 'utf8'));
const source = workflow.nodes.find((node: { type: string }) => node.type === 'n8n-nodes-base.code')
  .parameters.jsCode as string;
const binding = /const integration = \{\n {2}verify: async \(\) => null,[\s\S]*?\n\};/;
const commands = [
  ['35 almoço nubank', 'expense', '35.00', 'almoço nubank'],
  ['empresa 327,40 google ads inter', 'expense', '327.40', 'google ads inter'],
  ['recebi 2500 cliente empresa inter', 'income', '2500.00', 'cliente empresa inter'],
  ['transferi 500 nubank para inter', 'transfer', '500.00', null],
  ['último', 'query_last', null, null],
] as const;

async function count(table: 'transactions' | 'audit_events' | 'idempotency_keys') {
  const row = await fixture.db
    .selectFrom(table)
    .select(fixture.db.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

function event(text: string, patch: Record<string, unknown> = {}) {
  return {
    instance: 'local',
    messageId: randomUUID(),
    sender,
    corroboratingSender: sender,
    receivedAt: now.toISOString(),
    text,
    kind: 'message',
    contentKind: 'text',
    isGroup: false,
    fromMe: false,
    ...patch,
  };
}

async function run(
  candidate: ReturnType<typeof event>,
  verify = async (value: unknown) => value,
  // The generated Code node returns provider-shaped JSON, asserted below at the boundary.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  override: {
    financeTransport?: (request: any) => Promise<any>;
    sendTransport?: (request: any) => Promise<any>;
  } = {},
) {
  const financeCalls: unknown[] = [];
  const financeResponses: { status: number; body: any }[] = [];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const sends: unknown[] = [];
  const integration = {
    verify,
    configuredInstance: 'local',
    financeTransport: async (request: { body: unknown }) => {
      financeCalls.push(request.body);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: request.body,
      });
      const result = { status: response.statusCode, body: response.json() };
      financeResponses.push(result);
      return result;
    },
    sendTransport: async (request: unknown) => {
      sends.push(request);
      return { status: 200 };
    },
  };
  if (override.financeTransport) {
    integration.financeTransport = async (request) => {
      financeCalls.push(request.body);
      return override.financeTransport!(request);
    };
  }
  if (override.sendTransport)
    integration.sendTransport = async (request) => {
      sends.push(request);
      return override.sendTransport!(request);
    };
  expect((source.match(binding) ?? []).length).toBe(1);
  const result = await vm.runInNewContext(
    `(async () => { ${source.replace(binding, 'const integration = __integration;')} })()`,
    {
      $input: { first: () => ({ json: { body: candidate } }) },
      __integration: integration,
      setTimeout: (callback: () => void) => callback(),
    },
  );
  return { result, financeCalls, financeResponses, sends };
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: ids.book,
      name: 'Empresa',
      normalizedName: 'empresa',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.books.create({
      id: ids.personalBook,
      name: 'Pessoal',
      normalizedName: 'pessoal',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const [id, name] of [
      [ids.account, 'Nubank'],
      [ids.inter, 'Inter'],
    ] as const) {
      await ctx.accounts.create({
        id,
        bookId: ids.book,
        name,
        normalizedName: name.toLowerCase(),
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.accounts.create({
      id: ids.personalAccount,
      bookId: ids.personalBook,
      name: 'Carteira',
      normalizedName: 'carteira',
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.authorizedSenders.create({
      id: ids.sender,
      channel: 'whatsapp',
      senderReference: sender,
      name: 'Sender',
      defaultBookId: ids.book,
      defaultAccountId: ids.account,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    for (const [id, phone, book, account] of [
      [ids.accountChoiceSender, accountChoicePhone, ids.book, null],
      [ids.bookChoiceSender, bookChoicePhone, null, null],
      [ids.emptySender, emptyPhone, ids.personalBook, ids.personalAccount],
    ] as const)
      await ctx.authorizedSenders.create({
        id,
        channel: 'whatsapp',
        senderReference: phone,
        name: 'Sender',
        defaultBookId: book,
        defaultAccountId: account,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
  });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    app = buildApp({
      adminToken: 'integration-admin',
      ingestToken: 'integration-ingest',
      now: () => now,
    });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  await app.ready();
}, 180000);
afterAll(async () => {
  if (app) await app.close();
});

describe('P05 generated workflow to Finance API and PostgreSQL', () => {
  it.each(commands)(
    'parses the approved fields without trailing-name inference: %s',
    (command, expectedType, expectedAmount, description) => {
      const parsed = interpretMessage({ rawText: command });
      if (expectedType === 'query_last') {
        expect(parsed).toEqual({ kind: 'query_last' });
        return;
      }
      expect(parsed.kind).toBe('create_transaction');
      if (parsed.kind !== 'create_transaction') return;
      expect(parsed.transactionType.value).toBe(expectedType);
      expect(parsed.amount?.value).toBe(expectedAmount);
      expect(parsed.book?.value).toBe(command.startsWith('empresa ') ? 'empresa' : undefined);
      expect(parsed.account?.value).toBe(expectedType === 'transfer' ? 'nubank' : undefined);
      expect(parsed.destinationAccount?.value).toBe(
        expectedType === 'transfer' ? 'inter' : undefined,
      );
      expect(parsed.description?.value).toBe(description ?? undefined);
    },
  );
  it.each(commands)(
    'preserves exact command and canonical identity: %s',
    async (command, expectedType, expectedAmount, description) => {
      const before = {
        transactions: await count('transactions'),
        audits: await count('audit_events'),
        keys: await count('idempotency_keys'),
      };
      const candidate = event(command);
      const { financeCalls, financeResponses, sends } = await run(candidate);
      expect(financeCalls).toHaveLength(1);
      expect(financeCalls[0]).toMatchObject({
        source: 'whatsapp',
        source_instance: 'local',
        source_message_id: candidate.messageId,
        sender_reference: sender,
        raw_text: command,
      });
      const inbox = await fixture.db
        .selectFrom('inbox_messages')
        .selectAll()
        .where('source_instance', '=', 'local')
        .where('source_message_id', '=', candidate.messageId)
        .execute();
      expect(inbox).toHaveLength(1);
      expect(inbox[0]?.raw_text).toBe(command);
      expect(financeResponses).toHaveLength(1);
      expect(financeResponses[0]?.status).toBe(200);
      const data = financeResponses[0]!.body.data;
      expect(['transaction_created', 'confirmation_required', 'query_last']).toContain(
        data.result.type,
      );
      expect(sends).toHaveLength(1);
      expect(sends[0]).toMatchObject({
        credentialRef: 'evolution:send',
        message: { recipient: sender, text: data.reply.text },
      });
      expect(data.reply.contract).toEqual({ version: 'm06-p03-v1', max_code_points: 500 });
      if (expectedType === 'query_last') {
        expect(data.result.type).toBe('query_last');
        const latest = await fixture.db
          .selectFrom('transactions')
          .select('id')
          .where('status', '=', 'posted')
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .executeTakeFirstOrThrow();
        expect(data.result.transaction.id).toBe(latest.id);
        expect(data.reply.text).toBe(
          `Último lançamento: Transferência de R$ 500,00 em 28/10/2026.\nRef: ${data.result.transaction.human_ref}`,
        );
        expect(await count('transactions')).toBe(before.transactions);
        expect(await count('audit_events')).toBe(before.audits);
        expect(await count('idempotency_keys')).toBe(before.keys);
      } else {
        expect(data.result.type).toBe('transaction_created');
        const transaction = await fixture.db
          .selectFrom('transactions')
          .selectAll()
          .where('inbox_message_id', '=', data.inbox_message.id)
          .executeTakeFirstOrThrow();
        expect(transaction).toMatchObject({
          type: expectedType,
          amount: expectedAmount,
          book_id: ids.book,
          source: 'whatsapp',
          source_reference: candidate.messageId,
          status: 'posted',
        });
        expect(transaction.account_id).toBe(ids.account);
        expect(transaction.destination_account_id).toBe(
          expectedType === 'transfer' ? ids.inter : null,
        );
        expect(transaction.description).toBe(
          expectedType === 'transfer' ? 'Nubank para Inter' : description,
        );
        const ref = data.result.transaction.human_ref;
        const expectedReply =
          expectedType === 'expense'
            ? `✅ Gasto registrado! R$ ${expectedAmount === '35.00' ? '35,00' : '327,40'} — ${description}.\nRef: ${ref}`
            : expectedType === 'income'
              ? `✅ Receita registrada! R$ 2.500,00 — ${description}.\nRef: ${ref}`
              : `✅ Transferência registrada! R$ 500,00.\nRef: ${ref}`;
        expect(data.reply.text).toBe(expectedReply);
        const audit = await fixture.db
          .selectFrom('audit_events')
          .select(['entity_id', 'entity_type'])
          .where('entity_type', '=', 'transaction')
          .where('entity_id', '=', transaction.id)
          .execute();
        expect(audit).toEqual([{ entity_id: transaction.id, entity_type: 'transaction' }]);
        const keys = await fixture.db
          .selectFrom('idempotency_keys')
          .select(['resource_id', 'status'])
          .where('resource_id', '=', transaction.id)
          .execute();
        expect(keys).toEqual([{ resource_id: transaction.id, status: 'completed' }]);
        expect(await count('transactions')).toBe(before.transactions + 1);
        expect(await count('audit_events')).toBe(before.audits + 1);
        expect(await count('idempotency_keys')).toBe(before.keys + 1);
      }
    },
  );

  it.each([
    { instance: 'other' },
    { corroboratingSender: '5511888777666' },
    { isGroup: true },
    { fromMe: true },
  ])('rejects invalid identity or context before Finance: %j', async (patch) => {
    const before = await count('transactions');
    const { financeCalls, sends } = await run(event('35 almoço nubank', patch));
    expect(financeCalls).toHaveLength(0);
    expect(sends).toHaveLength(0);
    expect(await count('transactions')).toBe(before);
  });

  it('rejects forged origin before Finance', async () => {
    const before = await count('transactions');
    const { financeCalls, sends } = await run(event('último'), async () => null);
    expect(financeCalls).toHaveLength(0);
    expect(sends).toHaveLength(0);
    expect(await count('transactions')).toBe(before);
  });

  it('rejects unauthorized sender before raw Inbox persistence and sends no reply', async () => {
    const candidate = event('35 almoço nubank', {
      sender: '5511888777669',
      corroboratingSender: '5511888777669',
    });
    const before = await fixture.db.selectFrom('inbox_messages').select('id').execute();
    const { financeResponses, sends } = await run(candidate);
    expect(financeResponses[0]?.status).toBe(403);
    expect(sends).toHaveLength(0);
    expect(await fixture.db.selectFrom('inbox_messages').select('id').execute()).toHaveLength(
      before.length,
    );
  });

  it.each([401, 403])('%i from Finance causes zero automated replies', async (status) => {
    const { sends, financeCalls } = await run(event('último'), undefined, {
      financeTransport: async () => ({ status }),
    });
    expect(financeCalls).toHaveLength(1);
    expect(sends).toHaveLength(0);
  });

  it('same-identity replay creates one financial effect and suppresses duplicate reply', async () => {
    const candidate = event('35 almoço nubank');
    const before = await count('transactions');
    const first = await run(candidate);
    const duplicate = await run(candidate);
    expect(first.financeResponses[0]?.body.data.result.type).toBe('transaction_created');
    expect(first.sends).toHaveLength(1);
    expect(duplicate.financeResponses[0]?.body.data.result.type).toBe('duplicate_message');
    expect(duplicate.sends).toHaveLength(0);
    expect(await count('transactions')).toBe(before + 1);
  });

  it('lost Finance response retries the same identity without a second financial effect', async () => {
    const candidate = event('35 almoço nubank');
    const before = await count('transactions');
    let attempts = 0;
    const result = await run(candidate, undefined, {
      financeTransport: async (request) => {
        attempts++;
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: 'Bearer integration-ingest' },
          payload: request.body,
        });
        if (attempts === 1) throw { code: 'ETIMEDOUT' };
        return { status: response.statusCode, body: response.json() };
      },
    });
    expect(result.financeCalls).toHaveLength(2);
    expect(result.financeCalls[0]).toEqual(result.financeCalls[1]);
    expect(result.sends).toHaveLength(0);
    expect(await count('transactions')).toBe(before + 1);
  });

  it('outbound failure leaves the committed financial effect intact', async () => {
    const before = await count('transactions');
    const result = await run(event('35 almoço nubank'), undefined, {
      sendTransport: async () => ({ status: 400 }),
    });
    expect(result.financeCalls).toHaveLength(1);
    expect(result.sends).toHaveLength(1);
    expect(result.result[0].json.stage).toBe('send_failed');
    expect(await count('transactions')).toBe(before + 1);
  });

  it('ambiguous outbound timeout retries send only and records possible delivery', async () => {
    const before = await count('transactions');
    let attempts = 0;
    const result = await run(event('35 almoço nubank'), undefined, {
      sendTransport: async () => {
        attempts++;
        if (attempts === 1) throw { code: 'ETIMEDOUT' };
        return { status: 200 };
      },
    });
    expect(result.financeCalls).toHaveLength(1);
    expect(result.sends).toHaveLength(2);
    expect(result.result[0].json).toMatchObject({ stage: 'sent', possiblyDeliveredEarlier: true });
    expect(await count('transactions')).toBe(before + 1);
  });

  it('returns an empty Last without financial writes', async () => {
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const result = await run(
      event('último', { sender: emptyPhone, corroboratingSender: emptyPhone }),
    );
    expect(result.financeResponses[0]?.body.data.result).toMatchObject({
      type: 'query_last',
      transaction: null,
    });
    expect(result.financeResponses[0]?.body.data.reply.text).toBe(
      'Nenhum lançamento encontrado neste contexto.',
    );
    expect(result.sends).toHaveLength(1);
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });

  it('asks for Account and accepts a numbered choice', async () => {
    const first = await run(
      event('35 almoço nubank', {
        sender: accountChoicePhone,
        corroboratingSender: accountChoicePhone,
      }),
    );
    const data = first.financeResponses[0]?.body.data;
    expect(data.result.type).toBe('confirmation_required');
    expect(data.result.confirmation.action).toBe('select_account');
    expect(data.result.confirmation.options).toHaveLength(2);
    expect(data.reply.text).toContain('Escolha a conta:\n1.');
    expect(data.reply.text).toContain('Confirmação expira em 28/10/2026 às 12:15:00 UTC.');
    const second = await run(
      event('1', { sender: accountChoicePhone, corroboratingSender: accountChoicePhone }),
    );
    expect(second.financeResponses[0]?.body.data.result.type).toBe('transaction_created');
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', data.result.confirmation.id)
      .executeTakeFirstOrThrow();
    expect(session.status).toBe('confirmed');
  });

  it('asks for Book and accepts a numbered choice', async () => {
    const first = await run(
      event('35 almoço nubank', { sender: bookChoicePhone, corroboratingSender: bookChoicePhone }),
    );
    const data = first.financeResponses[0]?.body.data;
    expect(data.result.type).toBe('confirmation_required');
    expect(data.result.confirmation.action).toBe('select_book');
    expect(data.result.confirmation.options).toHaveLength(2);
    expect(data.reply.text).toContain('Escolha o contexto:\n1.');
    const second = await run(
      event('1', { sender: bookChoicePhone, corroboratingSender: bookChoicePhone }),
    );
    const selectedBook = data.result.confirmation.options[0].name;
    if (selectedBook === 'Empresa') {
      expect(second.financeResponses[0]?.body.data.result.type).toBe('confirmation_required');
      expect(second.financeResponses[0]?.body.data.result.confirmation.action).toBe(
        'select_account',
      );
      const third = await run(
        event('1', { sender: bookChoicePhone, corroboratingSender: bookChoicePhone }),
      );
      expect(third.financeResponses[0]?.body.data.result.type).toBe('transaction_created');
    } else {
      expect(selectedBook).toBe('Pessoal');
      expect(second.financeResponses[0]?.body.data.result.type).toBe('transaction_created');
    }
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', data.result.confirmation.id)
      .executeTakeFirstOrThrow();
    expect(session.status).toBe('confirmed');
  });
});
