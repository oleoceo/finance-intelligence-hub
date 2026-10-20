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
  type AccountRepository,
  type AccountRecord,
  type CategoryRepository,
  type CategoryRecord,
  type MerchantRepository,
  type MerchantRecord,
  type FinancialUsageReader,
  type SenderDefaultReferenceReader,
  type ConfigurationLockPort,
  type LockSpec,
  type TransactionPort,
  type TransactionContext,
} from './application/ports/master-data-ports.js';
