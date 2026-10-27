import type { Kysely } from 'kysely';
import {
  resolveInterpretation,
  type Interpretation,
  type ResolutionResult,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';
import { KyselyTransactionPort } from '../transaction/configuration-transaction.js';

/** Transactional configuration read for P03. No Inbox or financial writes. */
export class KyselyInboxConfigurationReader {
  private readonly transactions: KyselyTransactionPort;

  constructor(db: Kysely<DB>) {
    this.transactions = new KyselyTransactionPort(db);
  }

  resolve(input: {
    interpretation: Interpretation;
    channel: string;
    senderReference: string;
    receivedAt: Date;
    now: Date;
  }): Promise<ResolutionResult> {
    return resolveInterpretation(input, this.transactions);
  }
}
