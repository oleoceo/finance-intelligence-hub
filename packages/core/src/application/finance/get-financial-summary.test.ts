import { describe, expect, it, vi } from 'vitest';
import { getFinancialSummary } from './get-financial-summary.js';

const book = {
  id: 'book-a',
  name: 'A',
  normalizedName: 'a',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  active: false,
  archivedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function deps(now = '2024-03-01T02:30:00Z') {
  return {
    books: { findById: vi.fn().mockResolvedValue(book) },
    summaries: {
      getSummary: vi.fn().mockResolvedValue({
        ordinaryIncome: '100.00',
        grossExpenses: '500.00',
        refunds: '200.00',
      }),
    },
    now: () => new Date(now),
  };
}

describe('M08-P01 financial Summary', () => {
  it('calculates five exact values and the leap February in Book timezone', async () => {
    const dependencies = deps();
    const result = await getFinancialSummary({ bookId: book.id }, dependencies);
    expect(result).toEqual({
      bookId: book.id,
      currency: 'BRL',
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
      ordinaryIncome: '100.00',
      grossExpenses: '500.00',
      refunds: '200.00',
      netExpenses: '300.00',
      net: '-200.00',
    });
    expect(dependencies.summaries.getSummary).toHaveBeenCalledWith({
      bookId: book.id,
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
  });

  it('uses exact signed BigInt for large aggregate sums and empty results', async () => {
    const dependencies = deps();
    dependencies.summaries.getSummary.mockResolvedValueOnce({
      ordinaryIncome: '0.00',
      grossExpenses: '10000000000000000.01',
      refunds: '10000000000000000.02',
    });
    expect(await getFinancialSummary({ bookId: book.id }, dependencies)).toMatchObject({
      netExpenses: '-0.01',
      net: '0.01',
    });
    dependencies.summaries.getSummary.mockResolvedValueOnce({
      ordinaryIncome: '0.00',
      grossExpenses: '0.00',
      refunds: '0.00',
    });
    expect(await getFinancialSummary({ bookId: book.id }, dependencies)).toMatchObject({
      netExpenses: '0.00',
      net: '0.00',
    });
  });

  it('uses open explicit bounds and validates dates before querying', async () => {
    const dependencies = deps();
    await getFinancialSummary({ bookId: book.id, dateFrom: '2024-02-29' }, dependencies);
    expect(dependencies.summaries.getSummary).toHaveBeenCalledWith({
      bookId: book.id,
      dateFrom: '2024-02-29',
      dateTo: undefined,
    });
    for (const input of [
      { bookId: book.id, dateFrom: '2023-02-29' },
      { bookId: book.id, dateFrom: '2024-03-02', dateTo: '2024-03-01' },
    ])
      await expect(getFinancialSummary(input, dependencies)).rejects.toMatchObject({
        name: 'FinancialValidationError',
      });
    expect(dependencies.books.findById).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing Book and uses the Book timezone across DST', async () => {
    const dependencies = deps('2024-03-10T07:30:00Z');
    dependencies.books.findById.mockResolvedValueOnce(null);
    await expect(getFinancialSummary({ bookId: book.id }, dependencies)).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
    });
    dependencies.books.findById.mockResolvedValueOnce({ ...book, timezone: 'America/New_York' });
    expect(await getFinancialSummary({ bookId: book.id }, dependencies)).toMatchObject({
      dateFrom: '2024-03-01',
      dateTo: '2024-03-31',
    });
  });
});
