/**
 * SenderDefaultReferenceReader adapter implementing Core SenderDefaultReferenceReader contract.
 *
 * Queries the authorized_senders table to determine if a Book or Account is referenced as a default.
 */
import type { Kysely } from 'kysely';
import type { SenderDefaultReferenceReader } from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselySenderDefaultReferenceReader implements SenderDefaultReferenceReader {
  constructor(private readonly db: Kysely<DB>) {}

  async hasBookDefault(bookId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('authorized_senders')
      .select('id')
      .where('default_book_id', '=', bookId)
      .limit(1)
      .executeTakeFirst();

    return result !== undefined;
  }

  async hasAccountDefault(accountId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('authorized_senders')
      .select('id')
      .where('default_account_id', '=', accountId)
      .limit(1)
      .executeTakeFirst();

    return result !== undefined;
  }
}
