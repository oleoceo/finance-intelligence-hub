import type { Kysely } from 'kysely';
import type { InboxTransactionContext, InboxTransactionPort } from '@finance-hub/core';
import type { DB } from '../db-types.js';
import { KyselyAuthorizedSenderRepository } from '../repositories/authorized-sender-repository.js';
import { KyselyInboxMessageRepository } from '../repositories/inbox-message-repository.js';
import { KyselyConfigurationLockPort } from './configuration-transaction.js';

export class KyselyInboxTransactionPort implements InboxTransactionPort {
  constructor(private readonly db: Kysely<DB>) {}

  runInTransaction<T>(fn: (context: InboxTransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((tx) =>
      fn({
        senders: new KyselyAuthorizedSenderRepository(tx),
        locks: new KyselyConfigurationLockPort(tx),
        inbox: new KyselyInboxMessageRepository(tx),
      }),
    );
  }
}
