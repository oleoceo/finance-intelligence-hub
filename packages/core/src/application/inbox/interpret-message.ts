import { canonicalizeMoneyAmount } from '../../domain/finance/money.js';
import type { InboxMessage } from '../ports/inbox-ports.js';
import type {
  CreateCandidate,
  DateExpression,
  ExplicitValue,
  Interpretation,
} from '../ports/interpretation-ports.js';

const explicit = <T>(value: T, raw: string): ExplicitValue<T> => ({
  value,
  raw,
  provenance: 'explicit_input',
});
const command =
  /\b(?:recebi|receber|ganhei|entrada|transferi|transferir|transferência|gastei|paguei|despesa|gasto|último|ultimo|resumo|corrige|cancela|apaga|reembolso)\b/giu;
const amount =
  /(?<![\p{L}\p{N}/])(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,3})?(?![\p{L}\p{N}/])/gu;
const signedAmount =
  /(?:[+-]\s*(?:R\$\s*)?|R\$\s*[+-]\s*)(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,3})?(?![\p{L}\p{N}/])/u;
const accountingAmount =
  /\(\s*[+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,3})?\s*\)/u;
const date = /\b(?:hoje|ontem|anteontem|\d{2}\/\d{2}(?:\/\d{4})?)\b/iu;
const labels =
  /\b(livro|contexto|conta|categoria|estabelecimento|lojista|destino)\s*:\s*([^,;]+?)(?=\s+\b(?:livro|contexto|conta|categoria|estabelecimento|lojista|destino)\s*:|$)/giu;

function money(raw: string): string {
  const value = raw.replace(/^R\$\s*/u, '');
  const normalized = value.includes(',') ? value.replaceAll('.', '').replace(',', '.') : value;
  return canonicalizeMoneyAmount(normalized);
}

/** Pure interpretation of an already-authorized Inbox message. No reads or effects. */
export function interpretMessage(message: Pick<InboxMessage, 'rawText'>): Interpretation {
  const text = message.rawText.trim();
  if (!text) return { kind: 'unknown', reason: 'empty' };
  const lower = text.toLocaleLowerCase('pt-BR');
  const reply: Record<string, 'yes' | 'no' | '1' | '2'> = {
    sim: 'yes',
    não: 'no',
    nao: 'no',
    '1': '1',
    '2': '2',
  };
  if (reply[lower]) return { kind: 'reply', response: reply[lower] };

  const commands = [...text.matchAll(command)];
  if (commands.length > 1 || /[;\n]/u.test(text))
    return { kind: 'ambiguous', reason: 'multiple_commands' };
  if (/^(?:último|ultimo)(?:\s+empresa)?$/iu.test(text)) {
    return /empresa$/iu.test(text)
      ? { kind: 'query_last', book: explicit('empresa', 'empresa') }
      : { kind: 'query_last' };
  }
  if (/\b(?:resumo|corrige|cancela|apaga|reembolso)\b/iu.test(text))
    return { kind: 'unknown', reason: 'unsupported' };

  const transfer = /^(?:transferi|transferir|transferência)\b/iu.test(text);
  const income = /^(?:recebi|receber|ganhei|entrada)\b/iu.test(text);
  const expense = /^(?:gastei|paguei|despesa|gasto)\b/iu.test(text);
  const implicitExpense = /^(?:empresa\s+)?(?:R\$\s*)?\d/u.test(text);
  if (!transfer && !income && !expense && !implicitExpense)
    return { kind: 'unknown', reason: 'unsupported' };

  let body = text;
  if (transfer || income || expense) body = body.replace(/^\S+\s*/u, '');
  const candidate: CreateCandidate = {
    kind: 'create_transaction',
    transactionType:
      transfer || income || expense
        ? explicit(transfer ? 'transfer' : income ? 'income' : 'expense', text.split(/\s/u)[0]!)
        : { value: 'expense', raw: '', provenance: 'deterministic_grammar' },
  };
  if (/^empresa\b/iu.test(body)) {
    candidate.book = explicit('empresa', body.match(/^empresa/iu)![0]);
    body = body.replace(/^empresa\s*/iu, '');
  }

  const dates = [...body.matchAll(new RegExp(date.source, 'giu'))];
  if (dates.length > 1) return { kind: 'ambiguous', reason: 'conflicting_fields' };
  if (dates[0]) {
    const raw = dates[0][0];
    const expression: DateExpression = /\//u.test(raw)
      ? { kind: 'pt_br', value: raw }
      : {
          kind: 'relative',
          value: raw.toLocaleLowerCase('pt-BR') as 'hoje' | 'ontem' | 'anteontem',
        };
    candidate.date = explicit(expression, raw);
    body = body.replace(raw, ' ');
  }

  const fields = [...body.matchAll(labels)];
  const seen = new Set<string>();
  for (const field of fields) {
    const name = field[1]!.toLocaleLowerCase('pt-BR');
    const raw = field[2]!.trim();
    const key =
      name === 'livro' || name === 'contexto'
        ? 'book'
        : name === 'estabelecimento' || name === 'lojista'
          ? 'merchant'
          : name === 'destino'
            ? 'destinationAccount'
            : name === 'conta'
              ? 'account'
              : 'category';
    if (!raw || seen.has(key)) return { kind: 'ambiguous', reason: 'conflicting_fields' };
    seen.add(key);
    const value = explicit(raw, raw);
    if (key === 'book') candidate.book = value;
    else if (key === 'account') candidate.account = value;
    else if (key === 'destinationAccount') candidate.destinationAccount = value;
    else if (key === 'category') candidate.category = value;
    else candidate.merchant = value;
    body = body.replace(field[0], ' ');
  }

  if (signedAmount.test(body) || accountingAmount.test(body))
    return { kind: 'unknown', reason: 'invalid_amount' };
  const amounts = [...body.matchAll(amount)];
  if (amounts.length > 1) return { kind: 'ambiguous', reason: 'multiple_amounts' };
  if (!amounts.length) return { kind: 'unknown', reason: 'missing_amount' };
  try {
    candidate.amount = explicit(money(amounts[0]![0]), amounts[0]![0]);
  } catch {
    return { kind: 'unknown', reason: 'invalid_amount' };
  }
  body = body.replace(amounts[0]![0], ' ').trim();
  if (transfer) {
    const parts = body.match(/^(.+?)\s+para\s+(.+)$/iu);
    if (!parts || candidate.account || candidate.destinationAccount)
      return { kind: 'ambiguous', reason: 'incomplete_transfer' };
    candidate.account = explicit(parts[1]!.trim(), parts[1]!.trim());
    candidate.destinationAccount = explicit(parts[2]!.trim(), parts[2]!.trim());
  } else if (body) {
    candidate.description = explicit(body, body);
  }
  return candidate;
}
