/**
 * Financial transaction port adapter implementing Core FinancialTransactionPort contract.
 *
 * M04-T02 scope: provides a single outer PostgreSQL transaction that includes
 * master-data repositories, configuration locks, financial usage reader,
 * transaction repository, real idempotency repository and stub audit port.
 *
 * T07 owns calling runInTransaction in production. T02 tests call it directly.
 * This adapter reuses the existing KyselyConfigurationLockPort and M03 repositories.
 */

import type { Kysely } from 'kysely';
import {
  ConfigurationLockSetChangedError,
  ConcurrencyError,
  IdempotencyInProgressRetryError,
} from '@finance-hub/core';
import type {
  FinancialTransactionPort,
  FinancialTransactionContext,
  InboxProcessingContext,
  InboxProcessingPort,
} from '@finance-hub/core';
import { KyselyBookRepository } from '../repositories/book-repository.js';
import { KyselyAccountRepository } from '../repositories/account-repository.js';
import { KyselyCategoryRepository } from '../repositories/category-repository.js';
import { KyselyMerchantRepository } from '../repositories/merchant-repository.js';
import { KyselyConfigurationLockPort } from './configuration-transaction.js';
import { KyselyFinancialUsageReader } from '../readers/financial-usage-reader.js';
import { KyselyTransactionRepository } from '../repositories/transaction-repository.js';
import { KyselyIdempotencyKeyRepository } from '../repositories/idempotency-key-repository.js';
import { KyselyAuditWriter } from '../repositories/audit-writer.js';
import { KyselyClassificationRuleRepository } from '../repositories/classification-rule-repository.js';
import { KyselyAuthorizedSenderRepository } from '../repositories/authorized-sender-repository.js';
import { KyselySenderDefaultReferenceReader } from '../readers/sender-default-reference-reader.js';
import { KyselyInboxMessageRepository } from '../repositories/inbox-message-repository.js';
import { KyselyConfirmationSessionRepository } from '../repositories/confirmation-session-repository.js';
import { KyselyInterpretationRepository } from '../repositories/interpretation-repository.js';
import { KyselyTransactionReadRepository } from '../repositories/transaction-read-repository.js';
import type { DB } from '../db-types.js';

export class KyselyFinancialTransactionPort
  implements FinancialTransactionPort, InboxProcessingPort
{
  constructor(private readonly db: Kysely<DB>) {}

  async runInTransaction<T>(fn: (ctx: FinancialTransactionContext) => Promise<T>): Promise<T> {
    return this.runInboxTransaction(fn);
  }

  async runInboxTransaction<T>(fn: (ctx: InboxProcessingContext) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction().execute(async (tx) => {
          const books = new KyselyBookRepository(tx);
          const accounts = new KyselyAccountRepository(tx);
          const categories = new KyselyCategoryRepository(tx);
          const merchants = new KyselyMerchantRepository(tx);
          const locks = new KyselyConfigurationLockPort(tx);
          const financialUsage = new KyselyFinancialUsageReader(tx);
          const transactions = new KyselyTransactionRepository(tx);
          const idempotencyKeys = new KyselyIdempotencyKeyRepository(tx);
          const audit = new KyselyAuditWriter(tx);

          const ctx: InboxProcessingContext = {
            books,
            accounts,
            categories,
            merchants,
            locks,
            financialUsage,
            transactions,
            idempotencyKeys,
            audit,
            classificationRules: new KyselyClassificationRuleRepository(tx),
            authorizedSenders: new KyselyAuthorizedSenderRepository(tx),
            senderDefaults: new KyselySenderDefaultReferenceReader(tx),
            inbox: new KyselyInboxMessageRepository(tx),
            confirmations: new KyselyConfirmationSessionRepository(tx),
            interpretations: new KyselyInterpretationRepository(tx),
            reads: new KyselyTransactionReadRepository(tx),
            previewPending: async (owner) => {
              const row = await tx
                .selectFrom('confirmation_sessions')
                .select(['id', 'inbox_message_id', 'payload', 'action', 'expires_at'])
                .where('channel', '=', owner.channel)
                .where('sender_reference', '=', owner.senderReference)
                .where('authorized_sender_id', '=', owner.authorizedSenderId)
                .where('status', '=', 'pending')
                .executeTakeFirst();
              return row
                ? {
                    id: row.id,
                    inboxMessageId: row.inbox_message_id,
                    payload: row.payload,
                    action: row.action,
                    expiresAt: row.expires_at,
                  }
                : null;
            },
          };

          return await fn(ctx);
        });
      } catch (error) {
        const deadlock =
          typeof error === 'object' && error !== null && 'code' in error && error.code === '40P01';
        const lockTimeout =
          typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03';
        if (
          !(error instanceof ConfigurationLockSetChangedError) &&
          !(error instanceof IdempotencyInProgressRetryError) &&
          !deadlock &&
          !lockTimeout
        )
          throw error;
      }
    }
    throw new ConcurrencyError('Financial transaction could not complete after three attempts');
  }
}
