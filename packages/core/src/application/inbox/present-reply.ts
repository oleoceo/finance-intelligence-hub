import type { InboxProcessingResult } from './process-message.js';

/** Presentation policy only; the processor has already committed before this is called. */
export const REPLY_TEXT_LIMIT = 500;

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) return null;
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!text || [...text].length > max || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(text)) return null;
  return text;
}

function money(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== 'string' || !/^(?:0|[1-9]\d*)\.\d{2}$/.test(amount)) return null;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
  const [integer, cents] = amount.split('.');
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol = new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value;
  return symbol ? `${symbol} ${grouped},${cents}` : null;
}

function reference(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9]{1,16}$/.test(value) ? value : null;
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
    ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    : null;
}

function bounded(text: string | null): string | null {
  return text && [...text].length <= REPLY_TEXT_LIMIT ? text : null;
}

export function presentInboxReply(result: InboxProcessingResult): string | null {
  if (result.type === 'transaction_created') {
    const transaction = result.transaction;
    const amount = money(transaction.amount, transaction.currency);
    const ref = reference(transaction.humanRef);
    const description =
      transaction.type === 'transfer' ? null : safeText(transaction.description, 120);
    if (!amount || !ref || (transaction.type !== 'transfer' && !description)) return null;
    const heading = {
      expense: '✅ Gasto registrado!',
      income: '✅ Receita registrada!',
      transfer: '✅ Transferência registrada!',
    }[transaction.type];
    if (!heading) return null;
    return bounded(`${heading} ${amount}${description ? ` — ${description}` : ''}.\nRef: ${ref}`);
  }
  if (result.type === 'query_last') {
    if (!result.transaction) return 'Nenhum lançamento encontrado neste contexto.';
    const transaction = result.transaction;
    const amount = money(transaction.amount, transaction.currency);
    const ref = reference(transaction.humanRef);
    const when = date(transaction.transactionDate);
    const kind = { expense: 'Gasto', income: 'Receita', transfer: 'Transferência' }[
      transaction.type
    ];
    return amount && ref && when && kind
      ? bounded(`Último lançamento: ${kind} de ${amount} em ${when}.\nRef: ${ref}`)
      : null;
  }
  if (result.type === 'confirmation_required') {
    const { action, options } = result.confirmation;
    if (['select_book', 'select_account', 'clarify_book', 'clarify_account'].includes(action)) {
      if (
        action.startsWith('select_') &&
        options?.length === 2 &&
        options[0]?.number === '1' &&
        options[1]?.number === '2'
      ) {
        const first = safeText(options[0].name, 120);
        const second = safeText(options[1].name, 120);
        if (first && second)
          return bounded(
            `${action === 'select_book' ? 'Escolha o contexto' : 'Escolha a conta'}:\n1. ${first}\n2. ${second}\nResponda 1 ou 2.`,
          );
      }
      return 'Preciso de mais detalhes. Reenvie o comando completo com o contexto ou a conta.';
    }
    if (action === 'select_amount' || action === 'clarify_amount')
      return 'Qual é o valor? Reenvie o comando completo com o valor.';
    if (action === 'clarify_intent')
      return 'Não entendi o pedido. Reenvie o comando completo para continuar.';
    if (
      /^(?:select|clarify)_(?:category|merchant|description|date|destinationAccount)$/.test(action)
    )
      return 'Preciso de mais detalhes. Reenvie o comando completo com a informação que falta.';
    return null;
  }
  if (result.type === 'cancelled') return '✅ Solicitação pendente cancelada.';
  if (result.type === 'expired')
    return '⏳ Esta confirmação expirou. Reenvie o comando completo para tentar novamente.';
  return null;
}
