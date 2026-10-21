/**
 * Repository ports for Classification Rules and Authorized Senders.
 * Core-facing contracts that Database adapters must implement.
 */
import type {
  ClassificationRuleRecord,
  UpdateClassificationRuleRepoInput,
} from '../../domain/master-data/classification-rule.js';
import type {
  AuthorizedSenderRecord,
  UpdateAuthorizedSenderRepoInput,
} from '../../domain/master-data/authorized-sender.js';

/**
 * Classification Rule repository contract.
 */
export interface ClassificationRuleRepository {
  findById(id: string): Promise<ClassificationRuleRecord | null>;
  find(): Promise<ClassificationRuleRecord[]>;
  create(input: ClassificationRuleRecord): Promise<void>;
  update(input: UpdateClassificationRuleRepoInput): Promise<ClassificationRuleRecord>;
}

/**
 * Authorized Sender repository contract.
 */
export interface AuthorizedSenderRepository {
  findById(id: string): Promise<AuthorizedSenderRecord | null>;
  findByChannelAndReference(
    channel: string,
    senderReference: string,
  ): Promise<AuthorizedSenderRecord | null>;
  find(): Promise<AuthorizedSenderRecord[]>;
  create(input: AuthorizedSenderRecord): Promise<void>;
  update(input: UpdateAuthorizedSenderRepoInput): Promise<AuthorizedSenderRecord>;
}
