import type { InboxProcessingResult } from './process-message.js';

/** Presentation policy only; the processor has already committed before this is called. */
export const REPLY_TEXT_LIMIT = 500;
export const REPLY_CONTRACT_VERSION = 'm06-p03-v1';

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

function summaryMoney(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== 'string' || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(amount)) return null;
  const negative = amount.startsWith('-');
  const formatted = money(negative ? amount.slice(1) : amount, currency);
  return formatted ? `${negative ? '-' : ''}${formatted}` : null;
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

function confirmationExpiry(value: unknown): string | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  const iso = value.toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(iso);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, milliseconds] = match;
  const fraction = milliseconds === '000' ? '' : `,${milliseconds}`;
  return `Confirmação expira em ${day}/${month}/${year} às ${hour}:${minute}:${second}${fraction} UTC.`;
}

export function presentInboxReply(result: InboxProcessingResult): string | null {
  if (result.type === 'query_summary') {
    const book = safeText(result.bookName, 120) ?? 'contexto selecionado';
    const { summary } = result;
    const from = date(summary.dateFrom);
    const to = date(summary.dateTo);
    const values = [
      summary.ordinaryIncome,
      summary.grossExpenses,
      summary.refunds,
      summary.netExpenses,
      summary.net,
    ].map((value) => summaryMoney(value, summary.currency));
    if (!from || !to || values.some((value) => value === null)) return null;
    return bounded(
      `Resumo ${book} (${from} a ${to})\nReceitas ordinárias: ${values[0]}\nDespesas brutas: ${values[1]}\nEstornos: ${values[2]}\nDespesas líquidas: ${values[3]}\nResultado líquido: ${values[4]}`,
    );
  }
  if (result.type === 'stale_target')
    return 'O lançamento mudou. Reenvie o comando para validar os dados atuais.';
  if (result.type === 'transaction_mutated') {
    const ref = reference(result.transaction.humanRef);
    const amount = money(result.transaction.amount, result.transaction.currency);
    if (!ref || !amount) return null;
    const verb = { correction: 'corrigido', void: 'cancelado', refund: 'estornado' }[result.action];
    return bounded(`Lançamento ${verb}: ${amount}.\nRef: ${ref}`);
  }
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
    const expiry = confirmationExpiry(result.confirmation.expiresAt);
    if (!expiry) return null;
    const pending = (message: string) => bounded(`${message}\n${expiry}`);
    if (action === 'select_transaction' && options?.length === 2) {
      const first = reference(options[0]?.name);
      const second = reference(options[1]?.name);
      if (first && second)
        return pending(
          `Escolha o lançamento:\n1. Ref: ${first}\n2. Ref: ${second}\nResponda 1 ou 2. A escolha não confirma a operação.`,
        );
    }
    if (action === 'select_refund_account' && options?.length === 2) {
      const first = safeText(options[0]?.name, 100);
      const second = safeText(options[1]?.name, 100);
      if (first && second)
        return pending(
          `Onde o estorno foi creditado?\n1. ${first}\n2. ${second}\nResponda 1 ou 2. A escolha não confirma o estorno.`,
        );
    }
    if (action === 'clarify_transaction')
      return pending('Preciso da referência do lançamento. Reenvie o comando completo.');
    if (action.startsWith('confirm_')) {
      const proposal = result.confirmation.proposal;
      const ref = reference(proposal?.humanRef);
      const original = money(proposal?.amount, proposal?.currency);
      const description = safeText(proposal?.description, 100);
      const changed = money(proposal?.intent.amount, proposal?.currency);
      if (!ref || !original || !description) return null;
      if (action === 'confirm_void')
        return pending(
          `Cancelar lançamento ${ref}: ${description}, ${original}? Responda sim ou não.`,
        );
      if (action === 'confirm_correction' && changed)
        return pending(
          `Corrigir lançamento ${ref}: ${description}, de ${original} para ${changed}? Responda sim ou não.`,
        );
      const account = safeText(proposal?.accountName, 100);
      const when = date(proposal?.transactionDate);
      if (action === 'confirm_refund' && changed && account && when)
        return pending(
          `Estornar ${changed} da compra ${ref} (${description}, ${original}) na conta ${account} em ${when}? Responda sim ou não.`,
        );
      return null;
    }
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
          return pending(
            `${action === 'select_book' ? 'Escolha o contexto' : 'Escolha a conta'}:\n1. ${first}\n2. ${second}\nResponda 1 ou 2.`,
          );
      }
      return pending(
        'Preciso de mais detalhes. Reenvie o comando completo com o contexto ou a conta.',
      );
    }
    if (action === 'select_amount' || action === 'clarify_amount')
      return pending('Qual é o valor? Reenvie o comando completo com o valor.');
    if (action === 'clarify_intent')
      return pending('Não entendi o pedido. Reenvie o comando completo para continuar.');
    if (
      /^(?:select|clarify)_(?:category|merchant|description|date|destinationAccount)$/.test(action)
    )
      return pending(
        'Preciso de mais detalhes. Reenvie o comando completo com a informação que falta.',
      );
    return null;
  }
  if (result.type === 'cancelled') return '✅ Solicitação pendente cancelada.';
  if (result.type === 'expired')
    return '⏳ Esta confirmação expirou. Reenvie o comando completo para tentar novamente.';
  return null;
}
