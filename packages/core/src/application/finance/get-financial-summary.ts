import type { BookRepository } from '../ports/master-data-ports.js';
import type { SummaryReadPort } from '../ports/summary-ports.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';
import { validateTransactionDate } from '../../domain/finance/transaction-validation.js';

export interface FinancialSummaryInput {
  bookId: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FinancialSummaryDependencies {
  books: Pick<BookRepository, 'findById'>;
  summaries: SummaryReadPort;
  now: () => Date;
}

function cents(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error('Invalid Summary aggregate');
  }
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}

function decimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export async function getFinancialSummary(
  input: FinancialSummaryInput,
  deps: FinancialSummaryDependencies,
) {
  if (!input || typeof input.bookId !== 'string' || input.bookId.length === 0) {
    throw new FinancialValidationError('bookId is required', 'bookId');
  }
  if (input.dateFrom !== undefined) validateTransactionDate(input.dateFrom);
  if (input.dateTo !== undefined) validateTransactionDate(input.dateTo);
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    throw new FinancialValidationError('dateFrom must not exceed dateTo', 'dateFrom');
  }

  const book = await deps.books.findById(input.bookId);
  if (!book) throw new FinancialError('Book not found', 'BOOK_NOT_FOUND');

  let { dateFrom, dateTo } = input;
  if (dateFrom === undefined && dateTo === undefined) {
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: book.timezone,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(deps.now());
    } catch (cause) {
      throw new FinancialValidationError(
        'Invalid Book timezone or current instant',
        'timezone',
        cause,
      );
    }
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    dateFrom = `${prefix}-01`;
    dateTo = `${prefix}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  }

  const components = await deps.summaries.getSummary({ bookId: book.id, dateFrom, dateTo });
  const ordinaryIncome = cents(components.ordinaryIncome);
  const grossExpenses = cents(components.grossExpenses);
  const refunds = cents(components.refunds);
  const netExpenses = grossExpenses - refunds;
  return {
    bookId: book.id,
    currency: book.currency,
    dateFrom,
    dateTo,
    ordinaryIncome: decimal(ordinaryIncome),
    grossExpenses: decimal(grossExpenses),
    refunds: decimal(refunds),
    netExpenses: decimal(netExpenses),
    net: decimal(ordinaryIncome - netExpenses),
  };
}
