import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildApp } from '../../../../apps/api/src/index.js';
import { t02Database } from '../../../../tests/integration/repositories/t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-28T12:00:00Z');
const sender = '5511998877665';
const ids = { book: randomUUID(), account: randomUUID(), inter: randomUUID(), sender: randomUUID() };
let app: ReturnType<typeof buildApp>;
const workflow = JSON.parse(readFileSync(new URL('../p03/workflow.json', import.meta.url), 'utf8'));
const source = workflow.nodes.find((node: { type: string }) => node.type === 'n8n-nodes-base.code').parameters.jsCode as string;
const binding = /const integration = \{\n  verify: async \(\) => null,[\s\S]*?\n\};/;

function event(text: string, patch: Record<string, unknown> = {}) {
  return {
    instance: 'local', messageId: randomUUID(), sender, corroboratingSender: sender,
    receivedAt: now.toISOString(), text, kind: 'message', contentKind: 'text',
    isGroup: false, fromMe: false, ...patch,
  };
}

async function run(candidate: ReturnType<typeof event>, verify = async (value: unknown) => value) {
  const financeCalls: unknown[] = [];
  const sends: unknown[] = [];
  const integration = {
    verify, configuredInstance: 'local',
    financeTransport: async (request: { body: unknown }) => {
      financeCalls.push(request.body);
      const response = await app.inject({ method: 'POST', url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' }, payload: request.body });
      return { status: response.statusCode, body: response.json() };
    },
    sendTransport: async (request: unknown) => { sends.push(request); return { status: 200 }; },
  };
  expect((source.match(binding) ?? []).length).toBe(1);
  const result = await vm.runInNewContext(`(async () => { ${source.replace(binding, 'const integration = __integration;')} })()`, {
    $input: { first: () => ({ json: { body: candidate } }) }, __integration: integration,
    setTimeout: (callback: () => void) => callback(),
  });
  return { result, financeCalls, sends };
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    await ctx.books.create({ id: ids.book, name: 'Empresa', normalizedName: 'empresa', currency: 'BRL',
      timezone: 'America/Sao_Paulo', active: true, archivedAt: null, createdAt: now, updatedAt: now });
    for (const [id, name] of [[ids.account, 'Nubank'], [ids.inter, 'Inter']] as const) {
      await ctx.accounts.create({ id, bookId: ids.book, name, normalizedName: name.toLowerCase(),
        type: 'checking', currency: 'BRL', institutionName: null, notes: null,
        active: true, archivedAt: null, createdAt: now, updatedAt: now });
    }
    await ctx.authorizedSenders.create({ id: ids.sender, channel: 'whatsapp', senderReference: sender,
      name: 'Sender', defaultBookId: ids.book, defaultAccountId: ids.account,
      active: true, createdAt: now, updatedAt: now });
  });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try { app = buildApp({ adminToken: 'integration-admin', ingestToken: 'integration-ingest', now: () => now }); }
  finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
  await app.ready();
}, 180000);
afterAll(async () => { if (app) await app.close(); });

describe('P05 generated workflow to Finance API and PostgreSQL', () => {
  it.each(['35 almoço nubank', 'empresa 327,40 google ads inter',
    'recebi 2500 cliente empresa inter', 'transferi 500 nubank para inter', 'último'])
  ('preserves exact command and canonical identity: %s', async (command) => {
    const candidate = event(command);
    const { financeCalls } = await run(candidate);
    expect(financeCalls).toHaveLength(1);
    expect(financeCalls[0]).toMatchObject({ source: 'whatsapp', source_instance: 'local',
      source_message_id: candidate.messageId, sender_reference: sender, raw_text: command });
    const inbox = await fixture.db.selectFrom('inbox_messages').selectAll()
      .where('source_instance', '=', 'local').where('source_message_id', '=', candidate.messageId)
      .execute();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.raw_text).toBe(command);
  });

  it.each([{ instance: 'other' }, { corroboratingSender: '5511888777666' },
    { isGroup: true }, { fromMe: true }])('rejects invalid identity or context before Finance: %j', async (patch) => {
    const { financeCalls, sends } = await run(event('35 almoço nubank', patch));
    expect(financeCalls).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });

  it('rejects forged origin before Finance', async () => {
    const { financeCalls, sends } = await run(event('último'), async () => null);
    expect(financeCalls).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });
});
