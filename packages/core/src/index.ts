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
  type FinancialUsageReader,
  type SenderDefaultReferenceReader,
  type ConfigurationLockPort,
  type LockSpec,
  type TransactionPort,
  type TransactionContext,
  type MasterDataTransactionContext,
} from './application/ports/master-data-ports.js';

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
