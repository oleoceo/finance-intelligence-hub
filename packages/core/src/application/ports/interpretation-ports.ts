export interface ExplicitValue<T> {
  value: T;
  provenance: 'explicit_input' | 'deterministic_grammar';
  raw: string;
}

export type DateExpression =
  { kind: 'relative'; value: 'hoje' | 'ontem' | 'anteontem' } | { kind: 'pt_br'; value: string };

export interface CreateCandidate {
  kind: 'create_transaction';
  transactionType: ExplicitValue<'expense' | 'income' | 'transfer'>;
  amount?: ExplicitValue<string>;
  description?: ExplicitValue<string>;
  book?: ExplicitValue<string>;
  account?: ExplicitValue<string>;
  destinationAccount?: ExplicitValue<string>;
  category?: ExplicitValue<string>;
  merchant?: ExplicitValue<string>;
  date?: ExplicitValue<DateExpression>;
}

export type Interpretation =
  | CreateCandidate
  | { kind: 'query_last'; book?: ExplicitValue<string> }
  | { kind: 'reply'; response: 'yes' | 'no' | '1' | '2' }
  | { kind: 'unknown'; reason: 'empty' | 'unsupported' | 'missing_amount' | 'invalid_amount' }
  | {
      kind: 'ambiguous';
      reason:
        'multiple_commands' | 'multiple_amounts' | 'conflicting_fields' | 'incomplete_transfer';
    };
