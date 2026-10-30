/**
 * Finance Intelligence Hub - Core Package
 *
 * Exports domain primitives, application ports, and shared contracts.
 */

// Domain primitives
export { normalizeName, validateNonBlankName } from './domain/master-data/normalization.js';

export {
  validateArchivableState,
  archiveEntity,
  reactivateEntity,
  type ArchivableState,
} from './domain/master-data/lifecycle.js';

export {
  validateBookCurrencyChange,
  validateAccountBookIdChange,
  validateAccountImmutableFields,
  type BookDependencyCheck,
  type AccountFinancialUsageCheck,
} from './domain/master-data/immutability.js';

// Category cycle detection
export {
  CategoryCycleDetector,
  type CategoryNode,
} from './domain/master-data/category-cycle-detector.js';

// Domain errors
export {
  MasterDataError,
  ValidationError,
  LifecycleError,
  ImmutabilityError,
  DependencyError,
  ConcurrencyError,
} from './domain/master-data/errors.js';

// Application ports
export {
  type BookRepository,
  type BookRecord,
  type CreateBookInput,
  type UpdateBookInput,
  type ArchiveBookInput,
  type AccountRepository,
  type AccountRecord,
  type CreateAccountInput,
  type UpdateAccountInput,
  type ArchiveAccountInput,
  type CategoryRepository,
  type CategoryRecord,
  type CreateCategoryInput,
  type UpdateCategoryInput as UpdateCategoryRepoInput,
  type ArchiveCategoryInput,
  type MerchantRepository,
  type MerchantRecord,
  type CreateMerchantInput,
  type UpdateMerchantInput as UpdateMerchantRepoInput,
  type ArchiveMerchantInput,
  type ClassificationRuleRepository,
  type AuthorizedSenderRepository,
  type FinancialUsageReader,
  type SenderDefaultReferenceReader,
  type ConfigurationLockPort,
  type LockSpec,
  type TransactionPort,
  type TransactionContext,
  type MasterDataTransactionContext,
  type MasterDataTransactionContextT04,
  ConfigurationLockSetChangedError,
} from './application/ports/master-data-ports.js';

export type {
  ClassificationRuleRecord,
  UpdateClassificationRuleRepoInput,
} from './domain/master-data/classification-rule.js';

export type {
  AuthorizedSenderRecord,
  UpdateAuthorizedSenderRepoInput,
} from './domain/master-data/authorized-sender.js';

// M03-T02 use cases (public API)
export {
  createBook,
  getBook,
  listBooks,
  updateBook,
  archiveBook,
  type CreateBookInput as CreateBookUseCaseInput,
  type UpdateBookInput as UpdateBookUseCaseInput,
} from './application/master-data/book-use-cases.js';

export {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  archiveAccount,
  type CreateAccountInput as CreateAccountUseCaseInput,
  type UpdateAccountInput as UpdateAccountUseCaseInput,
} from './application/master-data/account-use-cases.js';

// M03-T03 use cases (public API)
export {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  archiveCategory,
  reactivateCategory,
  type CreateCategoryInput as CreateCategoryUseCaseInput,
  type UpdateCategoryInput as UpdateCategoryUseCaseInput,
} from './application/master-data/category-use-cases.js';

export {
  createMerchant,
  getMerchant,
  listMerchants,
  updateMerchant,
  archiveMerchant,
  reactivateMerchant,
  type CreateMerchantInput as CreateMerchantUseCaseInput,
  type UpdateMerchantInput as UpdateMerchantUseCaseInput,
} from './application/master-data/merchant-use-cases.js';

// M03-T04 use cases (public API)
export {
  createClassificationRule,
  getClassificationRule,
  listClassificationRules,
  updateClassificationRule,
} from './application/master-data/classification-rule-use-cases.js';

export {
  createAuthorizedSender,
  getAuthorizedSender,
  listAuthorizedSenders,
  updateAuthorizedSender,
} from './application/master-data/authorized-sender-use-cases.js';

export type {
  CreateClassificationRuleInput as CreateClassificationRuleUseCaseInput,
  UpdateClassificationRuleInput as UpdateClassificationRuleUseCaseInput,
} from './domain/master-data/classification-rule.js';

export type {
  CreateAuthorizedSenderInput as CreateAuthorizedSenderUseCaseInput,
  UpdateAuthorizedSenderInput as UpdateAuthorizedSenderUseCaseInput,
} from './domain/master-data/authorized-sender.js';

// M04-T01: Finance domain primitives
export { Money } from './domain/finance/money.js';

export {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_CREATE_SOURCES,
  isValidTransactionType,
  isValidTransactionStatus,
  isValidTransactionCreateSource,
  assertTransactionType,
  assertTransactionStatus,
  type TransactionType,
  type TransactionStatus,
  type TransactionCreateSource,
} from './domain/finance/transaction-types.js';

export {
  validateTransactionDate,
  validateTransactionDateNotFuture,
  validateMoneyAmount,
  validateTransactionCurrency,
  rejectInactiveBook,
  rejectInactiveAccount,
  rejectInactiveCategory,
  rejectInactiveMerchant,
  validateTransactionType,
  validateTransactionStatus,
  validateTransactionCreateSource,
  validateHumanRefField,
  validateTransferAccountsDiffer,
} from './domain/finance/transaction-validation.js';

export {
  isValidHumanRef,
  assertHumanRef,
  DeterministicHumanRefGenerator,
  type HumanRefGenerator,
} from './domain/finance/human-ref.js';

export { FinancialError, FinancialValidationError } from './domain/finance/errors.js';
export { canonicalizeMoneyAmount } from './domain/finance/money.js';

// M04-T01: Application ports
export {
  type TransactionRecord,
  type TransactionReadRecord,
  type CreateTransactionInput,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type CreateTransferInput,
  type ListTransactionsInput,
  type ListTransactionsResult,
  type GetLastTransactionInput,
  type TransactionRepository,
  type TransactionReadPort,
  type CorrectionFields,
  type PostedRefundLimits,
} from './application/ports/transaction-ports.js';

export {
  IDEMPOTENCY_STATES,
  type IdempotencyState,
  type IdempotencyKeyRecord,
  type IdempotencyScope,
  type IdempotencyFingerprint,
  type CreateIdempotencyKeyInput,
  type CompleteIdempotencyKeyInput,
  type IdempotencyKeyRepository,
} from './application/ports/idempotency-ports.js';

export {
  TRANSACTION_CREATE_SCOPE,
  resolveTransactionCreateScope,
  validateIdempotencyKey,
  canonicalJson,
  canonicalTransactionCreate,
  fingerprintTransactionCreate,
  decideExistingIdempotency,
  IdempotencyInProgressRetryError,
  type ExistingIdempotencyDecision,
} from './application/finance/idempotency.js';

export {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_SOURCES,
  type AuditAction,
  type AuditEntityType,
  type AuditSource,
  type WriteAuditEventInput,
  type AuditWriter,
} from './application/ports/audit-ports.js';

export {
  type FinancialTransactionContext,
  type FinancialTransactionPort,
} from './application/ports/financial-transaction-port.js';

// M04-T02: Create Expense use case
export {
  createExpense,
  type CreateExpenseDependencies,
} from './application/finance/create-expense.js';

// M04-T03: Create Ordinary Income use case
export {
  createOrdinaryIncome,
  type CreateIncomeDependencies,
} from './application/finance/create-income.js';

// M04-T04: Create Transfer use case
export {
  createTransfer,
  type CreateTransferDependencies,
} from './application/finance/create-transfer.js';

// M04-T05: Transaction Queries use cases
export {
  getTransaction,
  type GetTransactionDependencies,
} from './application/finance/get-transaction.js';

export {
  listTransactions,
  type ListTransactionsDependencies,
} from './application/finance/list-transactions.js';

export {
  getLastTransaction,
  type GetLastTransactionDependencies,
} from './application/finance/get-last-transaction.js';
export {
  GenericCreateTransaction,
  transactionSnapshot,
  type GenericCreateDependencies,
  type FinancialRequestContext,
} from './application/finance/create-transaction.js';
export {
  CorrectTransaction,
  prepareCorrectionLocks,
  type CorrectTransactionInput,
} from './application/finance/correct-transaction.js';
export type {
  InboxStatus,
  InboxIdentity,
  InboxMessage,
  NewInboxMessage,
  InboxClaim,
  InboxRepository,
  InboxTransactionContext,
  InboxTransactionPort,
} from './application/ports/inbox-ports.js';
export { InboxIdentityConflictError } from './application/ports/inbox-ports.js';
export { interpretMessage } from './application/inbox/interpret-message.js';
export {
  DEFAULT_CONFIRMATION_TTL_MS,
  confirmationExpiry,
  isConfirmationExpired,
  confirmationReplyOutcome,
} from './domain/inbox/confirmation-session.js';
export type { ConfirmationStatus, ConfirmationReply } from './domain/inbox/confirmation-session.js';
export { openConfirmation, resolveContextualReply } from './application/inbox/confirmation.js';
export type {
  ConfirmationSession,
  ConfirmationOwner,
  ConfirmationResolverClaim,
  NewConfirmationSession,
  ConfirmationResolution,
  ConfirmationSessionRepository,
} from './application/ports/confirmation-ports.js';
export { resolveInterpretation } from './application/inbox/resolve-interpretation.js';
export {
  processInboxMessage,
  StaleInboxClaimError,
  type ProcessMessageDependencies,
  type InboxProcessingResult,
} from './application/inbox/process-message.js';
export type {
  InboxProcessingContext,
  InboxProcessingPort,
} from './application/ports/financial-transaction-port.js';
export type {
  Interpretation,
  CreateCandidate,
  DateExpression,
  ExplicitValue,
  ResolutionResult,
} from './application/ports/interpretation-ports.js';
export {
  claimInboxMessage,
  normalizeSenderReference,
  SenderNotAuthorizedError,
  InvalidInboxEnvelopeError,
  type IngestionEnvelope,
} from './application/inbox/claim-inbox-message.js';
