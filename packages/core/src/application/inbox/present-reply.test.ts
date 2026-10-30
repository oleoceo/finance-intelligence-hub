import { describe, expect, it } from 'vitest';
import { presentInboxReply, REPLY_CONTRACT_VERSION, REPLY_TEXT_LIMIT } from './present-reply.js';
import type { InboxProcessingResult } from './process-message.js';

const transaction = {
  type: 'expense',
  amount: '1234.56',
  currency: 'BRL',
  description: 'Almoço',
  humanRef: 'ABC123',
  transactionDate: '2026-10-28',
} as Extract<InboxProcessingResult, { type: 'transaction_created' }>['transaction'];
const created = (patch: Record<string, unknown> = {}): InboxProcessingResult => ({
  type: 'transaction_created',
  inboxMessageId: 'inbox',
  status: 'processed',
  transaction: { ...transaction, ...patch },
});
const last = (patch: Record<string, unknown> = {}): InboxProcessingResult => ({
  type: 'query_last',
  inboxMessageId: 'inbox',
  status: 'processed',
  transaction: { ...transaction, ...patch } as Extract<
    InboxProcessingResult,
    { type: 'query_last' }
  >['transaction'],
});
const confirmation = (
  action: string,
  options?: { number: '1' | '2'; id: string; name: string }[],
  expiresAt = new Date('2026-10-28T12:15:00Z'),
): InboxProcessingResult => ({
  type: 'confirmation_required',
  inboxMessageId: 'inbox',
  status: 'needs_confirmation',
  confirmation: { id: 'session', action, expiresAt, options },
});

const expiryLine = '\nConfirmação expira em 28/10/2026 às 12:15:00 UTC.';

describe('Finance-owned reply presenter', () => {
  it('formats all Summary figures, including signed net, and hides the Book ID', () => {
    const reply = presentInboxReply({
      type: 'query_summary',
      inboxMessageId: 'private-inbox',
      status: 'processed',
      bookName: 'Pessoal',
      summary: {
        bookId: 'private-book',
        currency: 'BRL',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
        ordinaryIncome: '1234.56',
        grossExpenses: '2000.00',
        refunds: '100.25',
        netExpenses: '1899.75',
        net: '-665.19',
      },
    });
    expect(reply).toBe(
      'Resumo Pessoal (01/10/2026 a 31/10/2026)\nReceitas ordinárias: R$ 1.234,56\nDespesas brutas: R$ 2.000,00\nEstornos: R$ 100,25\nDespesas líquidas: R$ 1.899,75\nResultado líquido: -R$ 665,19',
    );
    expect([...reply!].length).toBeLessThanOrEqual(REPLY_TEXT_LIMIT);
    expect(reply).not.toContain('private-');
  });
  it('formats persisted success values and actual currency without floating point', () => {
    expect(presentInboxReply(created())).toBe(
      '✅ Gasto registrado! R$ 1.234,56 — Almoço.\nRef: ABC123',
    );
    expect(presentInboxReply(created({ type: 'income', currency: 'USD' }))).toBe(
      '✅ Receita registrada! US$ 1.234,56 — Almoço.\nRef: ABC123',
    );
    expect(presentInboxReply(created({ type: 'transfer' }))).toBe(
      '✅ Transferência registrada! R$ 1.234,56.\nRef: ABC123',
    );
  });
  it('formats Last and empty Last exactly', () => {
    expect(presentInboxReply(last())).toBe(
      'Último lançamento: Gasto de R$ 1.234,56 em 28/10/2026.\nRef: ABC123',
    );
    expect(
      presentInboxReply({
        type: 'query_last',
        inboxMessageId: 'inbox',
        status: 'processed',
        transaction: null,
      }),
    ).toBe('Nenhum lançamento encontrado neste contexto.');
  });
  it('shows only two safe persisted options', () => {
    const options = [
      { number: '1' as const, id: 'private-1', name: 'Casa' },
      { number: '2' as const, id: 'private-2', name: 'Empresa' },
    ];
    expect(presentInboxReply(confirmation('select_book', options))).toBe(
      `Escolha o contexto:\n1. Casa\n2. Empresa\nResponda 1 ou 2.${expiryLine}`,
    );
    expect(presentInboxReply(confirmation('select_account', options))).toBe(
      `Escolha a conta:\n1. Casa\n2. Empresa\nResponda 1 ou 2.${expiryLine}`,
    );
    expect(
      presentInboxReply(
        confirmation('select_account', [{ ...options[0]!, name: 'bad\nname' }, options[1]!]),
      ),
    ).toBe(
      `Preciso de mais detalhes. Reenvie o comando completo com o contexto ou a conta.${expiryLine}`,
    );
  });
  it('uses explicit clarification syntax and fixed lifecycle replies', () => {
    expect(presentInboxReply(confirmation('clarify_amount'))).toBe(
      `Qual é o valor? Reenvie o comando completo com o valor.${expiryLine}`,
    );
    expect(presentInboxReply(confirmation('clarify_intent'))).toBe(
      `Não entendi o pedido. Reenvie o comando completo para continuar.${expiryLine}`,
    );
    expect(presentInboxReply(confirmation('clarify_book'))).toBe(
      `Preciso de mais detalhes. Reenvie o comando completo com o contexto ou a conta.${expiryLine}`,
    );
    expect(presentInboxReply({ type: 'cancelled' })).toBe('✅ Solicitação pendente cancelada.');
    expect(presentInboxReply({ type: 'expired' })).toBe(
      '⏳ Esta confirmação expirou. Reenvie o comando completo para tentar novamente.',
    );
  });
  it('uses the persisted UTC expiry even when the pending window is almost over', () => {
    const nearExpiry = new Date('2026-10-28T12:00:00.500Z');
    expect(
      presentInboxReply(
        confirmation(
          'select_book',
          [
            { number: '1', id: 'private-1', name: 'Casa' },
            { number: '2', id: 'private-2', name: 'Empresa' },
          ],
          nearExpiry,
        ),
      ),
    ).toBe(
      'Escolha o contexto:\n1. Casa\n2. Empresa\nResponda 1 ou 2.\nConfirmação expira em 28/10/2026 às 12:00:00,500 UTC.',
    );
    expect(presentInboxReply(confirmation('clarify_intent', undefined, nearExpiry))).toContain(
      '12:00:00,500 UTC.',
    );
    expect(
      presentInboxReply(confirmation('select_book', undefined, new Date('invalid'))),
    ).toBeNull();
    expect(
      presentInboxReply(confirmation('clarify_amount', undefined, new Date('invalid'))),
    ).toBeNull();
  });
  it('fails closed for unsafe success fields, unknown actions and suppressed outcomes', () => {
    for (const patch of [
      { amount: '12.345' },
      { currency: 'bad' },
      { humanRef: 'secret\n' },
      { description: 'x'.repeat(121) },
      { type: 'unknown' },
    ])
      expect(presentInboxReply(created(patch))).toBeNull();
    expect(presentInboxReply(last({ transactionDate: '2026-02-30' }))).toBeNull();
    expect(presentInboxReply(confirmation('unknown'))).toBeNull();
    for (const type of [
      'ignored',
      'duplicate_message',
      'processing',
      'stale_claim',
      'choice',
    ] as const)
      expect(presentInboxReply({ type })).toBeNull();
  });
  it('bounds all reply text', () => {
    expect(REPLY_TEXT_LIMIT).toBe(500);
    expect(REPLY_CONTRACT_VERSION).toBe('m06-p03-v1');
    const result = presentInboxReply(created({ description: 'a'.repeat(120) }));
    expect(result).not.toBeNull();
    expect([...result!].length).toBeLessThanOrEqual(REPLY_TEXT_LIMIT);
    const maxChoices = presentInboxReply(
      confirmation('select_account', [
        { number: '1', id: 'private-1', name: 'A'.repeat(120) },
        { number: '2', id: 'private-2', name: 'B'.repeat(120) },
      ]),
    );
    expect(maxChoices).not.toBeNull();
    expect([...maxChoices!].length).toBeLessThanOrEqual(REPLY_TEXT_LIMIT);
  });
});
