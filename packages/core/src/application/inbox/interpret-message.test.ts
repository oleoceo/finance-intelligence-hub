import { describe, expect, it } from 'vitest';
import { interpretMessage } from './interpret-message.js';

const parse = (rawText: string) => interpretMessage({ rawText });

describe('deterministic Inbox interpretation', () => {
  it.each(['35 almoço nubank', 'empresa 327,40 google ads inter', 'gastei R$ 1.250,90 café'])(
    'parses partial expense %s',
    (text) => {
      const result = parse(text);
      expect(result.kind).toBe('create_transaction');
      if (result.kind === 'create_transaction') {
        expect(result.transactionType.value).toBe('expense');
        expect(result.amount?.provenance).toBe('explicit_input');
        expect(result).not.toHaveProperty('bookId');
        expect(result).not.toHaveProperty('transactionDate');
      }
    },
  );
  it('parses income without inventing missing references', () => {
    const result = parse('recebi 2500 cliente');
    expect(result).toMatchObject({
      kind: 'create_transaction',
      transactionType: { value: 'income' },
      amount: { value: '2500.00' },
    });
    expect(result).not.toHaveProperty('account');
  });
  it('parses transfer endpoints as explicit names', () => {
    expect(parse('transferi 500 nubank para inter')).toMatchObject({
      kind: 'create_transaction',
      transactionType: { value: 'transfer' },
      account: { value: 'nubank' },
      destinationAccount: { value: 'inter' },
    });
  });
  it.each(['hoje', 'ontem', 'anteontem', '03/09', '03/09/2026'])('preserves date %s', (value) => {
    const result = parse(`paguei 35 café ${value}`);
    expect(result.kind).toBe('create_transaction');
    if (result.kind === 'create_transaction') expect(result.date?.raw).toBe(value);
  });
  it.each(['sim', 'não', '1', '2'])('returns contextual reply %s', (value) => {
    expect(parse(value).kind).toBe('reply');
  });
  it('supports Last without a read', () => {
    expect(parse('último')).toEqual({ kind: 'query_last' });
    expect(parse('último empresa')).toMatchObject({
      kind: 'query_last',
      book: { value: 'empresa' },
    });
  });
  it.each(['35 almoço; recebi 20', 'paguei 30 e recebi 20'])(
    'rejects multiple commands %s',
    (value) => {
      expect(parse(value)).toEqual({ kind: 'ambiguous', reason: 'multiple_commands' });
    },
  );
  it.each(['paguei 0 café', 'paguei 1,234 café', 'paguei 10000000000000000 café'])(
    'rejects invalid money %s',
    (value) => {
      expect(parse(value)).toEqual({ kind: 'unknown', reason: 'invalid_amount' });
    },
  );
  it('preserves explicit fields over unresolved defaults', () => {
    expect(
      parse('paguei 35 café livro: empresa conta: inter categoria: alimentação'),
    ).toMatchObject({
      kind: 'create_transaction',
      book: { value: 'empresa', provenance: 'explicit_input' },
      account: { value: 'inter' },
      category: { value: 'alimentação' },
    });
  });
  it('works with no AI configuration or external dependency', () => {
    expect(parse('resumo')).toEqual({ kind: 'unknown', reason: 'unsupported' });
    expect(parse('transferi 10 nubank')).toEqual({
      kind: 'ambiguous',
      reason: 'incomplete_transfer',
    });
  });
});
