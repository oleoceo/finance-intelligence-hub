/** Read-only, unpaginated financial components for one Book and period. */
export interface SummaryReadPort {
  getSummary(input: {
    bookId: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ ordinaryIncome: string; grossExpenses: string; refunds: string }>;
}
